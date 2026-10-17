"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// Lort: a pill track pressed into the page (inset-sm) holding pill tabs; the selected tab
// inverts to an ink pill. components/lort/sort-tabs.tsx swaps that fill for a Motion pill
// that slides between tabs.

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("group/tabs flex gap-2 data-horizontal:flex-col", className)}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list relative inline-flex w-fit items-center rounded-full border border-border bg-background p-1 text-muted-foreground inset-shadow-sm",
  {
    variants: {
      size: {
        default: "h-[46px]",
        sm: "h-10",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

function TabsList({
  className,
  size = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-size={size}
      className={cn(tabsListVariants({ size }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative isolate inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-[18px] text-label whitespace-nowrap text-muted-foreground transition-colors duration-200 hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-active:bg-foreground data-active:text-background group-data-[size=sm]/tabs-list:h-8 group-data-[size=sm]/tabs-list:px-[13px] group-data-[size=sm]/tabs-list:text-caption group-data-[size=sm]/tabs-list:font-semibold [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-body outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
