// After stefan-karger/solid-ui's button, on P-Lens's tokens.

import * as ButtonPrimitive from "@kobalte/core/button"
import type { PolymorphicProps } from "@kobalte/core/polymorphic"
import { cva, type VariantProps } from "class-variance-authority"
import { splitProps, type JSX, type ValidComponent } from "solid-js"

import { cn } from "./cn"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[3px] text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-contrast hover:bg-accent-hover",
        secondary: "bg-surface-3 text-text-primary hover:bg-surface-0",
        ghost: "text-text-secondary hover:bg-surface-3 hover:text-text-primary",
        outline: "border border-border text-text-secondary hover:border-text-secondary hover:text-text-primary",
        danger: "bg-negative text-accent-contrast hover:opacity-90",
        amateur: "bg-amateur text-on-amateur hover:bg-amateur-hover",
        semipro: "bg-semipro font-semibold text-on-semipro hover:bg-semipro-hover",
        nerdpro: "bg-nerdpro font-semibold text-on-nerdpro hover:bg-nerdpro-hover",
      },
      size: {
        default: "h-9 px-4",
        small: "h-8 px-3 text-xs",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
)

type ButtonProps<T extends ValidComponent = "button"> = ButtonPrimitive.ButtonRootProps<T> &
  VariantProps<typeof buttonVariants> & { class?: string | undefined; children?: JSX.Element }

export const Button = <T extends ValidComponent = "button">(props: PolymorphicProps<T, ButtonProps<T>>) => {
  const [local, others] = splitProps(props as ButtonProps, ["variant", "size", "class"])
  return <ButtonPrimitive.Root class={cn(buttonVariants({ variant: local.variant, size: local.size }), local.class)} {...others} />
}

/**
 * A way on, written as a link, to somewhere a formula is worked out: its
 * grounds, its basis. In the semipro colour, as the buttons there are.
 */
export function SemiproLink(props: { readonly onClick: () => void; readonly class?: string; readonly children: JSX.Element }): JSX.Element {
  return (
    <button type="button" class={cn("text-semipro-ink underline-offset-2 hover:text-semipro-ink-hover hover:underline", props.class)} onClick={() => props.onClick()}>
      {props.children}
    </button>
  )
}
