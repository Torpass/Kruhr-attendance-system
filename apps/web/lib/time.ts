/** Todo se muestra en hora de Caracas, sin importar la zona del dispositivo. */
const TIME_ZONE = "America/Caracas";

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function caracasParts(date: Date) {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

const timeFormatter = new Intl.DateTimeFormat("es-VE", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dayFormatter = new Intl.DateTimeFormat("es-VE", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});

const hoursFormatter = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "08:05" */
export const formatTime = (iso: string) => timeFormatter.format(new Date(iso));

/** "lun, 5 oct" a partir de una fecha local YYYY-MM-DD. */
export const formatDay = (localDate: string) =>
  dayFormatter.format(new Date(`${localDate}T00:00:00Z`));

/** Minutos → "10,50" (las horas solo se redondean al mostrarlas). */
export const formatHours = (minutes: number) =>
  hoursFormatter.format(Math.round((minutes * 100) / 60) / 100);

/** Horas ya redondeadas por la API → "10,50". */
export const formatHoursValue = (hours: number) => hoursFormatter.format(hours);

/** Fecha local (Caracas) de un instante, YYYY-MM-DD. */
export function caracasDate(iso: string | Date) {
  const { year, month, day } = caracasParts(new Date(iso));
  return `${year}-${month}-${day}`;
}

/** Fecha de hoy en Caracas, YYYY-MM-DD. */
export const todayInCaracas = () => caracasDate(new Date());

export function addDays(localDate: string, days: number) {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** ISO → valor de un <input type="datetime-local"> en hora de Caracas. */
export function toCaracasInput(iso: string) {
  const { year, month, day, hour, minute } = caracasParts(new Date(iso));
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/** Valor de un <input type="datetime-local"> leído como hora de Caracas → ISO en UTC. */
export function fromCaracasInput(value: string) {
  const [date, time] = value.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  const local = caracasParts(new Date(guess));
  const offset =
    Date.UTC(+local.year, +local.month - 1, +local.day, +local.hour, +local.minute) - guess;
  return new Date(guess - offset).toISOString();
}
