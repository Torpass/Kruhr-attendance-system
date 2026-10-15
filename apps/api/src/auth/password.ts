import { hash, verify } from '@node-rs/argon2';

// Argon2id con los parámetros mínimos que recomienda OWASP (19 MiB, 2 iteraciones).
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

/** Hashea una contraseña o un PIN. */
export function hashSecret(secret: string): Promise<string> {
  return hash(secret, OPTIONS);
}

// Hash de relleno: si el usuario no existe se verifica contra él igual,
// para que el tiempo de respuesta no revele qué cuentas existen.
let dummyHash: Promise<string> | undefined;

/** Verifica un secreto contra su hash. Con `storedHash` vacío tarda lo mismo y devuelve false. */
export async function verifySecret(
  storedHash: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!storedHash) {
    dummyHash ??= hashSecret('dummy-secret-for-timing');
    await verify(await dummyHash, secret);
    return false;
  }
  return verify(storedHash, secret);
}
