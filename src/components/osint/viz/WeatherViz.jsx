// WeatherViz — open-meteo.
//
// Open-Meteo returns { current: { temperature_2m, wind_speed_10m,
// precipitation, relative_humidity_2m }, hourly: { time: [], temperature_2m: [],
// weather_code: [] } }. We show the current block big + a compact 12-hour
// temperature strip.

import { HeroLine, Chip, CollapseRawJson } from './_shared.jsx'

// WMO weather code → short label + emoji. Compact mapping — good enough for
// a summary strip; the raw JSON footer exposes the numeric code for anyone
// who needs the exact WMO reference.
function wmoIcon(code) {
  if (code == null) return '·'
  if (code === 0) return '☀️'
  if (code <= 3) return '⛅'
  if (code <= 48) return '🌫️'
  if (code <= 57) return '🌦️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌧️'
  if (code <= 86) return '🌨️'
  if (code <= 99) return '⛈️'
  return '·'
}

export default function WeatherViz({ data }) {
  const c = data?.current
  if (!c) {
    return (
      <div>
        <div className='text-gray-500 text-xs'>No weather data for that coordinate.</div>
        <CollapseRawJson data={data} />
      </div>
    )
  }
  const hourly = data.hourly || {}
  const times = hourly.time || []
  const temps = hourly.temperature_2m || []
  const codes = hourly.weather_code || []
  const nowIdx = Math.max(0, times.findIndex((t) => t === c.time))
  const strip = times.slice(nowIdx, nowIdx + 12).map((t, i) => ({
    t, temp: temps[nowIdx + i], code: codes[nowIdx + i],
  }))
  return (
    <div>
      <HeroLine
        eyebrow='Now'
        value={<><span className='text-3xl'>{Math.round(c.temperature_2m)}°</span> <span className='text-xs text-gray-400 font-normal'>{data.current_units?.temperature_2m || 'C'}</span></>}
        sub={`Humidity ${c.relative_humidity_2m}% · Wind ${c.wind_speed_10m} ${data.current_units?.wind_speed_10m || 'km/h'}`}
        right={<Chip tone='cyan'>{data.timezone_abbreviation || 'UTC'}</Chip>}
      />
      {strip.length > 0 && (
        <div className='flex overflow-x-auto gap-1 mt-2 pb-1'>
          {strip.map((h) => (
            <div key={h.t} className='shrink-0 w-14 text-center bg-white/[0.03] rounded px-1 py-1.5'>
              <div className='text-[9px] text-gray-500'>{h.t?.slice(11, 16)}</div>
              <div className='text-lg leading-none my-0.5'>{wmoIcon(h.code)}</div>
              <div className='text-white text-xs'>{Math.round(h.temp)}°</div>
            </div>
          ))}
        </div>
      )}
      <CollapseRawJson data={data} />
    </div>
  )
}
