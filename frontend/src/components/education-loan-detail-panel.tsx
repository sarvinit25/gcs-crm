import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Loader2, Pencil } from "lucide-react";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import type { EducationLoanDetailRecord, EducationLoanParent } from "../lib/types";
import { DatePicker } from "./date-picker";

function parentFromForm(f: FormData, prefix: string): EducationLoanParent {
  const num = (name: string) => {
    const v = f.get(name);
    return v ? Number(v) : undefined;
  };
  const str = (name: string) => (f.get(name) as string) || undefined;
  return {
    contactIndia: str(`${prefix}ContactIndia`),
    contactAbroad: str(`${prefix}ContactAbroad`),
    currentAddress: str(`${prefix}CurrentAddress`),
    permanentAddress: str(`${prefix}PermanentAddress`),
    yearsAtCurrentAddress: num(`${prefix}YearsAtCurrentAddress`),
    personalEmail: str(`${prefix}PersonalEmail`),
    qualification: str(`${prefix}Qualification`),
    officeName: str(`${prefix}OfficeName`),
    officeAddress: str(`${prefix}OfficeAddress`),
    designation: str(`${prefix}Designation`),
    officeEmail: str(`${prefix}OfficeEmail`),
    totalExpYears: num(`${prefix}TotalExpYears`),
    currentCompanyExpYears: num(`${prefix}CurrentCompanyExpYears`),
  };
}

function ParentFields({ prefix, label }: { prefix: string; label: string }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input name={`${prefix}ContactIndia`} placeholder="Contact (India)" className="field" />
        <input name={`${prefix}ContactAbroad`} placeholder="Contact (abroad, if any)" className="field" />
        <input name={`${prefix}CurrentAddress`} placeholder="Current address" className="field sm:col-span-2" />
        <input name={`${prefix}PermanentAddress`} placeholder="Permanent address" className="field sm:col-span-2" />
        <input
          name={`${prefix}YearsAtCurrentAddress`}
          type="number"
          placeholder="Years at current address"
          className="field"
        />
        <input name={`${prefix}PersonalEmail`} placeholder="Personal email" className="field" />
        <input name={`${prefix}Qualification`} placeholder="Qualification" className="field" />
        <input name={`${prefix}OfficeName`} placeholder="Office name" className="field" />
        <input name={`${prefix}OfficeAddress`} placeholder="Office address" className="field sm:col-span-2" />
        <input name={`${prefix}Designation`} placeholder="Designation" className="field" />
        <input name={`${prefix}OfficeEmail`} placeholder="Office email" className="field" />
        <input
          name={`${prefix}TotalExpYears`}
          type="number"
          placeholder="Total years working"
          className="field"
        />
        <input
          name={`${prefix}CurrentCompanyExpYears`}
          type="number"
          placeholder="Years at current company"
          className="field"
        />
      </div>
    </div>
  );
}

export function EducationLoanDetailPanel({ applicationId }: { applicationId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const query = useQuery({
    queryKey: ["education-loan-detail", applicationId],
    queryFn: () => api<EducationLoanDetailRecord>(`/applications/${applicationId}/education-loan-detail`),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/applications/${applicationId}/education-loan-detail`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ["education-loan-detail", applicationId] });
    },
  });

  const details = query.data?.details;
  const hasDetails = !!details && Object.keys(details).length > 0;

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-navy">
          <GraduationCap className="h-4 w-4 text-gold-dark" /> Education Loan Details
        </h2>
        {!editing && (
          <button onClick={() => setEditing(true)} className="btn-ghost">
            <Pencil className="h-4 w-4" /> {hasDetails ? "Edit" : "Fill in"}
          </button>
        )}
      </div>

      {query.isPending ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : !editing ? (
        !hasDetails ? (
          <p className="text-[13px] text-muted">
            No family or course details captured yet — this covers the student's family
            background, references and course, on top of the standard applicant fields.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {details?.course && (
              <div className="sm:col-span-2">
                <p className="text-[11px] font-bold tracking-wide text-muted uppercase">Course</p>
                <p className="text-[13px]">
                  {[details.course.courseName, details.course.universityName, details.course.country]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                  {details.course.courseStartDate && ` · starts ${formatDate(details.course.courseStartDate)}`}
                </p>
              </div>
            )}
            {details?.father?.contactIndia && (
              <div>
                <p className="text-[11px] font-bold tracking-wide text-muted uppercase">Father</p>
                <p className="text-[13px]">
                  {details.father.designation ?? "—"} · {details.father.contactIndia}
                </p>
              </div>
            )}
            {details?.mother?.contactIndia && (
              <div>
                <p className="text-[11px] font-bold tracking-wide text-muted uppercase">Mother</p>
                <p className="text-[13px]">
                  {details.mother.designation ?? "—"} · {details.mother.contactIndia}
                </p>
              </div>
            )}
            {!!details?.friendReferences?.filter((r) => r.name).length && (
              <div className="sm:col-span-2">
                <p className="text-[11px] font-bold tracking-wide text-muted uppercase">
                  Friend references
                </p>
                <p className="text-[13px]">
                  {details!.friendReferences!.filter((r) => r.name)
                    .map((r) => r.name)
                    .join(", ")}
                </p>
              </div>
            )}
          </div>
        )
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const str = (name: string) => (f.get(name) as string) || undefined;
            const num = (name: string) => (f.get(name) ? Number(f.get(name)) : undefined);

            save.mutate({
              student: {
                email: str("studentEmail"),
                currentAddress: str("studentCurrentAddress"),
                permanentAddress: str("studentPermanentAddress"),
                yearsAtCurrentAddress: num("studentYearsAtCurrentAddress"),
              },
              father: parentFromForm(f, "father"),
              mother: parentFromForm(f, "mother"),
              paternalGrandmotherName: str("paternalGrandmotherName"),
              maternalGrandmotherName: str("maternalGrandmotherName"),
              friendReferences: [
                { name: str("friend1Name"), address: str("friend1Address"), phone: str("friend1Phone") },
                { name: str("friend2Name"), address: str("friend2Address"), phone: str("friend2Phone") },
              ],
              course: {
                loanAmount: num("courseLoanAmount"),
                courseName: str("courseName"),
                courseDuration: str("courseDuration"),
                courseStartDate: f.get("courseStartDate")
                  ? new Date(f.get("courseStartDate") as string).toISOString()
                  : undefined,
                universityName: str("universityName"),
                country: str("country"),
              },
            });
          }}
          className="space-y-5"
        >
          {save.isError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {(save.error as Error).message}
            </p>
          )}

          <div>
            <p className="mb-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">
              Student
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                name="studentEmail"
                type="email"
                defaultValue={details?.student?.email}
                placeholder="Email"
                className="field"
              />
              <input
                name="studentYearsAtCurrentAddress"
                type="number"
                defaultValue={details?.student?.yearsAtCurrentAddress}
                placeholder="Years at current address"
                className="field"
              />
              <input
                name="studentCurrentAddress"
                defaultValue={details?.student?.currentAddress}
                placeholder="Current address"
                className="field sm:col-span-2"
              />
              <input
                name="studentPermanentAddress"
                defaultValue={details?.student?.permanentAddress}
                placeholder="Permanent address"
                className="field sm:col-span-2"
              />
            </div>
          </div>

          <ParentFields prefix="father" label="Father" />
          <ParentFields prefix="mother" label="Mother" />

          <div>
            <p className="mb-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">
              Family
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                name="paternalGrandmotherName"
                defaultValue={details?.paternalGrandmotherName}
                placeholder="Paternal grandmother's name"
                className="field"
              />
              <input
                name="maternalGrandmotherName"
                defaultValue={details?.maternalGrandmotherName}
                placeholder="Maternal grandmother's name"
                className="field"
              />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">
              Friend references
            </p>
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-3">
                  <input
                    name={`friend${i + 1}Name`}
                    defaultValue={details?.friendReferences?.[i]?.name}
                    placeholder="Name"
                    className="field"
                  />
                  <input
                    name={`friend${i + 1}Address`}
                    defaultValue={details?.friendReferences?.[i]?.address}
                    placeholder="Address"
                    className="field"
                  />
                  <input
                    name={`friend${i + 1}Phone`}
                    defaultValue={details?.friendReferences?.[i]?.phone}
                    placeholder="Phone"
                    className="field"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">
              Course
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                name="courseLoanAmount"
                type="number"
                defaultValue={details?.course?.loanAmount}
                placeholder="Loan amount required"
                className="field"
              />
              <input
                name="courseName"
                defaultValue={details?.course?.courseName}
                placeholder="Course name"
                className="field"
              />
              <input
                name="courseDuration"
                defaultValue={details?.course?.courseDuration}
                placeholder="Course duration"
                className="field"
              />
              <DatePicker
                name="courseStartDate"
                defaultValue={details?.course?.courseStartDate?.slice(0, 10)}
                placeholder="Course start date"
              />
              <input
                name="universityName"
                defaultValue={details?.course?.universityName}
                placeholder="University name"
                className="field"
              />
              <input
                name="country"
                defaultValue={details?.course?.country}
                placeholder="Country"
                className="field"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending} className="btn-primary">
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save details
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn-ghost">
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
