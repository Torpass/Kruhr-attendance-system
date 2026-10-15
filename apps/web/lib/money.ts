const moneyFormatter = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1897.31 → "1.897,31" */
export const formatMoney = (value: number) => moneyFormatter.format(value);

export const RUN_STATE = {
  computed: { label: "Calculado", tone: "marca" },
  validated: { label: "Validado", tone: "alerta" },
  paid: { label: "Pagado", tone: "exito" },
  cancelled: { label: "Anulado", tone: "error" },
} as const;
