import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Downloads } from "@/components/Downloads";
import { CopyButton } from "@/components/CopyButton";
import { ForkIcon, GitHubIcon, Glyph, OsTags, StarIcon, StatusBadge } from "@/components/ui";
import { apps, date, getApp } from "@/lib/store";

export function generateStaticParams() {
  return apps.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata(props: PageProps<"/apps/[slug]">): Promise<Metadata> {
  const app = getApp((await props.params).slug);
  return app ? { title: app.name, description: app.tagline } : {};
}

export default async function AppPage(props: PageProps<"/apps/[slug]">) {
  const { slug } = await props.params;
  const a = getApp(slug);
  if (!a) notFound();

  const related = apps.filter((x) => x.category_slug === a.category_slug && x.id !== a.id);
  const transcript = a.demo.map((l) => l.text).join("\n");

  const meta: [string, React.ReactNode][] = [
    ["Version", <span key="v" className="font-mono">{a.latest_version ? `v${a.latest_version}` : "—"}</span>],
    ["Released", date(a.latest_released_at)],
    ["Category", a.category],
    ["Language", a.language ?? "—"],
    ["License", a.licenses.join(" or ") || "—"],
    ["Stars", <span key="s" className="inline-flex items-center gap-1"><StarIcon />{a.stars_count.toLocaleString("en-US")}</span>],
    ["Forks", <span key="f" className="inline-flex items-center gap-1"><ForkIcon />{a.forks_count.toLocaleString("en-US")}</span>],
  ];

  return (
    <div className="animate-fade">
      <Link href="/" className="mt-7 mb-6 inline-block text-sm text-mute transition-colors hover:text-ink">
        <span aria-hidden="true">← </span>Back to all apps
      </Link>

      <div className="flex flex-wrap items-start gap-5 border-b border-line pb-7">
        <Glyph name={a.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 font-mono text-[clamp(26px,4vw,36px)] leading-[1.15] font-bold tracking-[-0.02em]">{a.name}</h1>
            <StatusBadge status={a.status} />
          </div>
          <p className="mt-1.5 max-w-[38em] text-mute">{a.tagline}</p>
        </div>
      </div>

      {a.status === "maintenance" && (
        <p role="note" className="mt-6 border border-line border-l-4 border-l-idle bg-surface px-4 py-3 text-sm text-mute">
          This project is in maintenance mode and may not receive new features or fixes. Check its GitHub page for a recommended successor.
        </p>
      )}

      <div className="grid grid-cols-1 gap-8 pt-8 min-[860px]:grid-cols-[minmax(0,1fr)_340px] min-[860px]:gap-10">
        <div>
          <Block title="About">
            <p className="m-0 max-w-[42em] text-mute">{a.about}</p>
          </Block>

          <Block title="Features">
            <ul className="m-0 list-none border-t border-line p-0">
              {a.features.map((f) => (
                <li key={f} className="flex gap-3 border-b border-line py-3">
                  <span aria-hidden="true" className="font-mono text-accent">›</span>
                  {f}
                </li>
              ))}
            </ul>
          </Block>

          {a.demo.length > 0 && (
            <Block
              title="Preview"
              action={<CopyButton text={transcript} label="Copy" className="text-mute hover:text-ink" />}
            >
              <div className="overflow-hidden rounded-xl border border-line bg-[#0b0d12]">
                <div aria-hidden="true" className="flex gap-1.5 border-b border-white/10 px-4 py-2.5">
                  <span className="size-2.5 rounded-full bg-white/15" />
                  <span className="size-2.5 rounded-full bg-white/15" />
                  <span className="size-2.5 rounded-full bg-white/15" />
                </div>
                <pre className="m-0 overflow-x-auto px-[18px] py-4 font-mono text-[13px] leading-[1.7] text-[#d7dae0]">
                  {a.demo.map((l, i) => (
                    <div key={i} className={l.prompt ? "text-[#8aa0ff]" : undefined}>{l.text || " "}</div>
                  ))}
                </pre>
              </div>
            </Block>
          )}

          {related.length > 0 && (
            <Block title={`More in ${a.category}`}>
              <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/apps/${r.slug}`}
                      className="flex items-center gap-3 border border-line bg-surface p-3 transition-colors hover:border-ink"
                    >
                      <Glyph name={r.name} />
                      <span className="min-w-0">
                        <span className="block font-mono text-sm">{r.name}</span>
                        <span className="block truncate text-xs text-mute">{r.tagline}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Block>
          )}
        </div>

        <aside className="flex flex-col gap-4 self-start min-[860px]:sticky min-[860px]:top-[72px]">
          <Downloads app={a} />
          <div className="border border-line bg-surface">
            <h2 className="m-0 border-b border-line px-4 py-3.5 text-sm font-bold">Details</h2>
            <dl className="m-0 px-4 pt-1 pb-3">
              {meta.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-line py-2 text-sm last:border-b-0">
                  <dt className="text-mute">{k}</dt>
                  <dd className="m-0 text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="px-4 pb-4">
              <OsTags support={a.support} />
            </div>
            <a
              href={a.github_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mx-4 mb-4 flex items-center justify-center gap-1.5 border border-line px-2.5 py-1.5 text-sm transition-colors hover:border-ink hover:bg-hover"
            >
              <GitHubIcon />
              View on GitHub
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Block({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-9">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="m-0 text-lg font-bold tracking-[-0.01em]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
