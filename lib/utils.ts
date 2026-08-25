import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function validarCPF(cpf: string) {
  cpf = cpf.replace(/[^\d]+/g, '');
  if (cpf.length !== 11 || !!cpf.match(/(\d)\1{10}/)) return false;
  let t = 9;
  let d = 0;
  let c = 0;
  for (t = 9; t < 11; t++) {
    for (d = 0, c = 0; c < t; c++) {
      d += parseInt(cpf.charAt(c)) * ((t + 1) - c);
    }
    d = ((10 * d) % 11) % 10;
    if (cpf.charAt(c) !== d.toString()) return false;
  }
  return true;
}

export function maskCPF(value: string) {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
}

export function maskPhone(value: string) {
  let v = value.replace(/\D/g, '');
  v = v.replace(/^(\d{2})(\d)/g, '($1) $2');
  v = v.replace(/(\d)(\d{4})$/, '$1-$2');
  return v;
}

export function validarPlaca(placa: string) {
  const oldRegex = /^[A-Z]{3}[0-9]{4}$/;
  const mercosulRegex = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
  const upperPlaca = placa.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return oldRegex.test(upperPlaca) || mercosulRegex.test(upperPlaca);
}

export function maskPlaca(value: string) {
  return value
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 7)
    .replace(/^([A-Z]{3})([0-9A-Z]{1,4})$/, '$1-$2');
}
