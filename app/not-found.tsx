import NotFoundCard from "@/app/components/NotFoundCard";

export default function NotFound() {
  return (
    <NotFoundCard
      eyebrow="404"
      title="This trail dead-ends"
      message="That page moved, closed, or never existed. The live lots are this way."
      actions={[
        { href: "/auctions", label: "Browse live auctions", primary: true },
        { href: "/", label: "Back to home" },
      ]}
    />
  );
}
