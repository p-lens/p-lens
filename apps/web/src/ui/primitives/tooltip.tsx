// After stefan-karger/solid-ui's tooltip, on P-Lens's tokens.

import type { PolymorphicProps } from "@kobalte/core/polymorphic"
import * as TooltipPrimitive from "@kobalte/core/tooltip"
import { splitProps, type Component, type ValidComponent } from "solid-js"

import { cn } from "./cn"

export const TooltipTrigger = TooltipPrimitive.Trigger

export const Tooltip: Component<TooltipPrimitive.TooltipRootProps> = (props) => <TooltipPrimitive.Root gutter={8} {...props} />

type TooltipContentProps<T extends ValidComponent = "div"> = TooltipPrimitive.TooltipContentProps<T> & { class?: string | undefined }

export const TooltipContent = <T extends ValidComponent = "div">(props: PolymorphicProps<T, TooltipContentProps<T>>) => {
  const [local, others] = splitProps(props as TooltipContentProps, ["class"])
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        class={cn("z-50 rounded-md bg-surface-0 px-3 py-1.5 text-sm font-semibold text-text-primary shadow-lg", local.class)}
        {...others}
      />
    </TooltipPrimitive.Portal>
  )
}
