const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export interface BlogPost {
  id: string;
  title: string;
  body: string;
  published: boolean;
  publish_at: string | null;
  created_at: string;
}

export async function fetchPublishedPosts(): Promise<BlogPost[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/operations/blog?published_only=true`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return (await res.json()) as BlogPost[];
  } catch {
    return [];
  }
}

export async function submitAdmissionApplication(payload: {
  applicant_name: string;
  guardian_contact: string;
  date_of_birth?: string;
  notes?: string;
}): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/operations/admissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error("Failed to submit admission application");
  }
}

export async function submitContactEnquiry(payload: {
  name: string;
  contact: string;
  message: string;
}): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/operations/enquiries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error("Failed to submit enquiry");
  }
}
