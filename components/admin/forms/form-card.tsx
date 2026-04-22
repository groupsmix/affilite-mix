import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface FormCardProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}

/**
 * Consistent card wrapper used across admin forms. Renders a shadcn Card with
 * an optional title/description header and a content area with vertical spacing.
 */
export function FormCard({ title, description, children }: FormCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}
