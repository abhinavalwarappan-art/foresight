import "server-only";
import type { Game, Team, WeatherContext } from "@/lib/domain/types";
import { providerFetch } from "@/lib/providers/http";

export interface WeatherProvider {
  readonly name: string;
  isConfigured(): boolean;
  getGameWeather(game: Game, home: Team): Promise<WeatherContext | null>;
}

type Roof = WeatherContext["roof"];
interface Venue { lat: number; lon: number; roof: Roof }

// Stable stadium metadata; forecasts still come from the weather provider.
const VENUES: Record<string, Venue> = {
  ARI: { lat: 33.5276, lon: -112.2626, roof: "retractable" }, ATL: { lat: 33.7554, lon: -84.4008, roof: "retractable" },
  BAL: { lat: 39.278, lon: -76.6227, roof: "outdoor" }, BUF: { lat: 42.7738, lon: -78.787, roof: "outdoor" },
  CAR: { lat: 35.2258, lon: -80.8528, roof: "outdoor" }, CHI: { lat: 41.8623, lon: -87.6167, roof: "outdoor" },
  CIN: { lat: 39.0954, lon: -84.516, roof: "outdoor" }, CLE: { lat: 41.5061, lon: -81.6995, roof: "outdoor" },
  DAL: { lat: 32.7473, lon: -97.0945, roof: "retractable" }, DEN: { lat: 39.7439, lon: -105.0201, roof: "outdoor" },
  DET: { lat: 42.34, lon: -83.0456, roof: "dome" }, GB: { lat: 44.5013, lon: -88.0622, roof: "outdoor" },
  HOU: { lat: 29.6847, lon: -95.4107, roof: "retractable" }, IND: { lat: 39.7601, lon: -86.1639, roof: "retractable" },
  JAX: { lat: 30.3239, lon: -81.6373, roof: "outdoor" }, KC: { lat: 39.0489, lon: -94.4839, roof: "outdoor" },
  LV: { lat: 36.0908, lon: -115.183, roof: "dome" }, LAC: { lat: 33.9535, lon: -118.3392, roof: "dome" }, LAR: { lat: 33.9535, lon: -118.3392, roof: "dome" },
  MIA: { lat: 25.958, lon: -80.2389, roof: "outdoor" }, MIN: { lat: 44.9736, lon: -93.2575, roof: "dome" },
  NE: { lat: 42.0909, lon: -71.2643, roof: "outdoor" }, NO: { lat: 29.9511, lon: -90.0812, roof: "dome" },
  NYG: { lat: 40.8135, lon: -74.0745, roof: "outdoor" }, NYJ: { lat: 40.8135, lon: -74.0745, roof: "outdoor" },
  PHI: { lat: 39.9008, lon: -75.1675, roof: "outdoor" }, PIT: { lat: 40.4468, lon: -80.0158, roof: "outdoor" },
  SEA: { lat: 47.5952, lon: -122.3316, roof: "outdoor" }, SF: { lat: 37.403, lon: -121.97, roof: "outdoor" },
  TB: { lat: 27.9759, lon: -82.5033, roof: "outdoor" }, TEN: { lat: 36.1665, lon: -86.7713, roof: "outdoor" },
  WAS: { lat: 38.9076, lon: -76.8645, roof: "outdoor" },
};

interface Forecast {
  hourly?: { time?: string[]; temperature_2m?: number[]; relative_humidity_2m?: number[]; precipitation_probability?: number[]; precipitation?: number[]; weather_code?: number[]; wind_speed_10m?: number[]; wind_gusts_10m?: number[] };
}

const condition = (code: number | undefined) => code == null ? null : code === 0 ? "Clear" : code <= 3 ? "Cloudy" : code <= 49 ? "Fog" : code <= 69 ? "Rain" : code <= 79 ? "Snow" : code <= 84 ? "Showers" : "Thunderstorms";

export const openMeteo: WeatherProvider = {
  name: "open-meteo",
  isConfigured: () => true,
  async getGameWeather(game, home) {
    if (game.sport !== "nfl") return null;
    const venue = VENUES[home.abbr];
    if (!venue) return null;
    const relevant = venue.roof === "outdoor" || venue.roof === "unknown";
    const base = { gameId: game.id, relevant, roof: venue.roof };
    if (!relevant) return { ...base, temperatureF: null, windMph: null, windGustMph: null, precipitationProbability: null, precipitationIn: null, humidity: null, condition: null, forecastTimestamp: null, provenance: provenance() };
    const days = (Date.parse(game.date) - Date.now()) / 86_400_000;
    if (days < -1 || days > 16) return null;
    const query = new URLSearchParams({ latitude: String(venue.lat), longitude: String(venue.lon), hourly: "temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m", temperature_unit: "fahrenheit", wind_speed_unit: "mph", precipitation_unit: "inch", timezone: "UTC", forecast_days: "16" });
    const res = await providerFetch<Forecast>(`https://api.open-meteo.com/v1/forecast?${query}`, { provider: "open-meteo", cacheKey: `weather:${home.abbr}:${game.date.slice(0, 13)}`, cacheClass: "weather" });
    const times = res.data.hourly?.time ?? [];
    let idx = times.reduce((best, t, i) => Math.abs(Date.parse(`${t}Z`) - Date.parse(game.date)) < Math.abs(Date.parse(`${times[best]}Z`) - Date.parse(game.date)) ? i : best, 0);
    if (!times.length) idx = -1;
    const at = <T,>(xs?: T[]) => idx >= 0 ? xs?.[idx] ?? null : null;
    return { ...base, temperatureF: at(res.data.hourly?.temperature_2m), windMph: at(res.data.hourly?.wind_speed_10m), windGustMph: at(res.data.hourly?.wind_gusts_10m), precipitationProbability: at(res.data.hourly?.precipitation_probability), precipitationIn: at(res.data.hourly?.precipitation), humidity: at(res.data.hourly?.relative_humidity_2m), condition: condition(at(res.data.hourly?.weather_code) ?? undefined), forecastTimestamp: idx >= 0 ? `${times[idx]}Z` : null, provenance: { ...provenance(), retrievedAt: res.retrievedAt, stale: res.stale, cache: res.cache } };
  },
};

const provenance = () => ({ source: "open-meteo", sourceTimestamp: null, retrievedAt: new Date().toISOString(), confidence: null, isProjection: false as const, kind: "observed" as const });
