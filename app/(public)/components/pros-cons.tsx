interface ProsConsProps {
  pros: string[];
  cons: string[];
  language?: string;
}

export function ProsCons({ pros, cons, language = "en" }: ProsConsProps) {
  const isAr = language === "ar";

  if (pros.length === 0 && cons.length === 0) return null;

  return (
    <div className="my-6 grid gap-4 sm:grid-cols-2">
      {/* Pros */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <h4 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-emerald-800">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-xs text-white">+</span>
          {isAr ? "المميزات" : "Pros"}
        </h4>
        {pros.length > 0 ? (
          <ul className="space-y-2">
            {pros.map((pro, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-emerald-900">
                <span className="mt-0.5 text-emerald-500">&#10003;</span>
                {pro}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm italic text-emerald-600">
            {isAr ? "لا توجد مميزات مدرجة" : "No pros listed"}
          </p>
        )}
      </div>

      {/* Cons */}
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <h4 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-red-800">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">&minus;</span>
          {isAr ? "العيوب" : "Cons"}
        </h4>
        {cons.length > 0 ? (
          <ul className="space-y-2">
            {cons.map((con, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-red-900">
                <span className="mt-0.5 text-red-500">&#10007;</span>
                {con}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm italic text-red-400">
            {isAr ? "لا توجد عيوب مدرجة" : "No cons listed"}
          </p>
        )}
      </div>
    </div>
  );
}
