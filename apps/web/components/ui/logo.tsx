import Image from "next/image";
import kruLogo from "@/public/brand/kru-logo.png";

/** Marca del producto: el logo de Kru seguido de "Hr" (KruHr). */
export function Logo() {
  return (
    <span role="img" aria-label="KruHr" className="inline-flex items-end gap-1">
      <Image src={kruLogo} alt="" priority className="h-7 w-auto" />
      <span aria-hidden className="text-[2.2rem] font-extrabold leading-[0.72] tracking-[-0.05em] text-kru-700">
        Hr
      </span>
    </span>
  );
}
