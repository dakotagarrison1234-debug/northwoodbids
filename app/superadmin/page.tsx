export const dynamic = "force-dynamic";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ApplicationReviewCard from "./ApplicationReviewCard";

export default async function SuperAdminPage() {
  await requireSuperAdmin();

  const applications = await prisma.orgApplication.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const pending = applications.filter((a) => a.status === "PENDING");
  const reviewed = applications.filter((a) => a.status !== "PENDING");

  return (
    <>
      <header className="border-b border-[#e5e0d5]/60 px-4 sm:px-8 py-4">
        <h1 className="text-lg font-bold">Org Applications</h1>
        <p className="text-[#8c8778] text-sm mt-0.5">
          {pending.length} pending · {reviewed.length} reviewed
        </p>
      </header>

      <div className="px-4 sm:px-8 py-5 max-w-4xl space-y-8">
        {pending.length === 0 && (
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-8 text-center text-[#8c8778] text-sm">
            No pending applications.
          </div>
        )}

        {pending.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-orange-400 uppercase tracking-[0.12em] mb-4">
              Pending Review ({pending.length})
            </h2>
            <div className="space-y-4">
              {pending.map((app) => (
                <ApplicationReviewCard key={app.id} application={app} />
              ))}
            </div>
          </section>
        )}

        {reviewed.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-[#8c8778] uppercase tracking-[0.12em] mb-4">
              Reviewed ({reviewed.length})
            </h2>
            <div className="space-y-2.5">
              {reviewed.map((app) => (
                <div
                  key={app.id}
                  className="bg-white border border-[#e5e0d5]/60 rounded-2xl px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{app.orgName}</div>
                    <div className="text-[#8c8778] text-sm mt-0.5 truncate">
                      {app.contactEmail} · {new Date(app.createdAt).toLocaleDateString()}
                    </div>
                    {app.reviewNote && (
                      <div className="text-[#8c8778] text-xs mt-1">Note: {app.reviewNote}</div>
                    )}
                  </div>
                  <span
                    className={`text-xs px-3 py-1 rounded-full font-bold self-start sm:self-auto shrink-0 ${
                      app.status === "APPROVED"
                        ? "bg-[#09a7ad]/20 text-[#09a7ad]"
                        : "bg-red-500/20 text-red-600"
                    }`}
                  >
                    {app.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
