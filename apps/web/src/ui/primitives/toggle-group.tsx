// After stefan-karger/solid-ui's toggle-group, on P-Lens's tokens.

import type { PolymorphicProps } from "@kobalte/core/polymorphic"
import * as ToggleGroupPrimitive from "@kobalte/core/toggle-group"
import { splitProps, type JSX, type ValidComponent } from "solid-js"

import { cn } from "./cn"

type ToggleGroupRootProps<T extends ValidComponent = "div"> = ToggleGroupPrimitive.ToggleGroupRootProps<T> & {
  class?: string | undefined
  children?: JSX.Element
}

export const ToggleGroup = <T extends ValidComponent = "div">(props: PolymorphicProps<T, ToggleGroupRootProps<T>>) => {
  const [local, others] = splitProps(props as ToggleGroupRootProps, ["class"])
  return <ToggleGroupPrimitive.Root class={cn("inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-md bg-surface-input p-1", local.class)} {...others} />
}

type ToggleGroupItemProps<T extends ValidComponent = "button"> = ToggleGroupPrimitive.ToggleGroupItemProps<T> & {
  class?: string | undefined
  children?: JSX.Element
}

export const ToggleGroupItem = <T extends ValidComponent = "button">(props: PolymorphicProps<T, ToggleGroupItemProps<T>>) => {
  const [local, others] = splitProps(props as ToggleGroupItemProps, ["class"])
  return (
    <ToggleGroupPrimitive.Item
      class={cn(
        "inline-flex h-8 items-center justify-center whitespace-nowrap rounded px-3 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary disabled:pointer-events-none disabled:opacity-50 data-[pressed]:bg-surface-3 data-[pressed]:text-text-primary",
        local.class,
      )}
      {...others}
    />
  )
}
