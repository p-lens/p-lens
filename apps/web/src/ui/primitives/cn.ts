import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/** Join class names, later Tailwind classes winning over earlier ones. */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))
