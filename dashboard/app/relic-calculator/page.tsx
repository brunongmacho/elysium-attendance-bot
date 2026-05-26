"use client";

import { Breadcrumb } from "@/components/ui";
import { Stack } from "@/components/layout";
import RelicCalculator from "@/components/RelicCalculator";

export default function RelicCalculatorPage() {
  return (
    <Stack gap="lg">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Relic Calculator', current: true },
        ]}
      />

      <RelicCalculator />
    </Stack>
  );
}