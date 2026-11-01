import { Sk } from "@/components/ui";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading app" className="pt-7">
      <Sk className="h-3 w-[110px]" />
      <div className="my-6 flex items-center gap-5 pb-7">
        <Sk className="size-16" />
        <div className="flex-1 space-y-3">
          <Sk className="h-7 w-[min(260px,70%)]" />
          <Sk className="h-3.5 w-[min(420px,90%)]" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-8 min-[860px]:grid-cols-[minmax(0,1fr)_340px] min-[860px]:gap-10">
        <div className="space-y-3">
          <Sk className="h-[18px] w-[120px]" />
          <Sk className="h-3 w-full" />
          <Sk className="h-3 w-[85%]" />
          <div className="h-6" />
          <Sk className="h-[18px] w-[120px]" />
          <Sk className="h-10 w-full" />
          <Sk className="h-10 w-full" />
          <Sk className="h-10 w-full" />
          <Sk className="mt-7 h-[110px] rounded-xl" />
        </div>
        <Sk className="h-[380px]" />
      </div>
    </div>
  );
}
