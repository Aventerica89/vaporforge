import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { type VariantProps } from "class-variance-authority"

export type PromptSuggestionProps = {
  children: React.ReactNode
  variant?: VariantProps<typeof buttonVariants>["variant"]
  size?: VariantProps<typeof buttonVariants>["size"]
  className?: string
  highlight?: string
} & React.ButtonHTMLAttributes<HTMLButtonElement>

function PromptSuggestion({
  children,
  variant,
  size,
  className,
  highlight,
  ...props
}: PromptSuggestionProps) {
  const isHighlightMode = highlight !== undefined && highlight.trim() !== ""
  const content = typeof children === "string" ? children : ""

  if (!isHighlightMode) {
    return (
      <Button
        variant={variant || "outline"}
        size={size || "lg"}
        className={cn("rounded-full", className)}
        {...props}
      >
        {children}
      </Button>
    )
  }

  if (!content) {
    return (
      <Button
        variant={variant || "ghost"}
        size={size || "sm"}
        className={cn("w-full justify-start rounded-xl py-2 hover:bg-accent", className)}
        {...props}
      >
        {children}
      </Button>
    )
  }

  const trimmedHighlight = highlight.trim()
  const contentLower = content.toLowerCase()
  const highlightLower = trimmedHighlight.toLowerCase()
  const index = contentLower.indexOf(highlightLower)

  return (
    <Button
      variant={variant || "ghost"}
      size={size || "sm"}
      className={cn("w-full justify-start gap-0 rounded-xl py-2 hover:bg-accent", className)}
      {...props}
    >
      {index === -1 ? (
        <span className="whitespace-pre-wrap text-muted-foreground">{content}</span>
      ) : (
        <>
          {index > 0 && (
            <span className="whitespace-pre-wrap text-muted-foreground">
              {content.substring(0, index)}
            </span>
          )}
          <span className="whitespace-pre-wrap font-medium text-primary">
            {content.substring(index, index + trimmedHighlight.length)}
          </span>
          {index + trimmedHighlight.length < content.length && (
            <span className="whitespace-pre-wrap text-muted-foreground">
              {content.substring(index + trimmedHighlight.length)}
            </span>
          )}
        </>
      )}
    </Button>
  )
}

export { PromptSuggestion }
