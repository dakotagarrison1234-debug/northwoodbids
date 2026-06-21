interface Props {
  name: string;
  logoUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeMap = {
  xs: "w-8 h-8 text-sm rounded-lg",
  sm: "w-10 h-10 text-base rounded-xl",
  md: "w-14 h-14 text-xl rounded-2xl",
  lg: "w-20 h-20 text-2xl rounded-2xl",
  xl: "w-28 h-28 text-4xl rounded-3xl",
};

export default function OrgLogo({ name, logoUrl, size = "md", className = "" }: Props) {
  const sizeClass = sizeMap[size];

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className={`${sizeClass} object-cover shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} bg-[#a4592a]/20 flex items-center justify-center font-bold text-[#a4592a] shrink-0 ${className}`}
    >
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}
