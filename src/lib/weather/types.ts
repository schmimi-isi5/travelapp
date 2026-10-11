export interface WeatherDay {
  date: string;
  /** `forecast` is a model forecast; `climate` is the average of the same calendar days in earlier years (not a forecast). */
  source: 'forecast' | 'climate';
  tmax: number | null;
  tmin: number | null;
  rainMm: number | null;
  /** Forecast: probability in percent. Climate: share of the compared years with at least 1 mm of rain. */
  rainChance: number | null;
  windMax: number | null;
  uvMax: number | null;
  sunrise: string | null;
  sunset: string | null;
}

export interface WeatherResult {
  days: WeatherDay[];
  fetchedAt: string;
  attribution: string;
  /** Years averaged for `climate` days (empty when every day is a forecast). */
  climateYears: number[];
}
