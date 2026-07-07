import { ArrowRight, BookOpenText, MessageCircle, Newspaper, ShieldCheck } from "lucide-react";

import { AdmissionForm } from "../components/AdmissionForm";
import { ContactForm } from "../components/ContactForm";
import { fetchPublishedPosts } from "../lib/api";

export default async function HomePage() {
  const posts = await fetchPublishedPosts();

  return (
    <main>
      <nav className="siteNav" aria-label="Public site">
        <strong>Madrasa Management System</strong>
        <div>
          <a href="#blog">Blog</a>
          <a href="#contact">Contact</a>
          <a href="#admission">Admission</a>
        </div>
      </nav>

      <section className="hero">
        <div className="heroCopy">
          <span className="eyebrow">Public madrasa website</span>
          <h1>Madrasa Management System</h1>
          <p>
            A server-rendered public front door for admissions, announcements, blog posts, and parent contact, connected to the operational MMS backend.
          </p>
          <a className="heroAction" href="#admission">
            Start admission application <ArrowRight size={18} />
          </a>
        </div>
      </section>

      <section className="featureBand" aria-label="Public website modules">
        <article>
          <BookOpenText size={22} />
          <h2>Landing page</h2>
          <p>Clear madrasa profile, program overview, and contact routes for families.</p>
        </article>
        <article>
          <Newspaper size={22} />
          <h2>SEO blog</h2>
          <p>Teacher-authored posts with categories, tags, and server-rendered pages.</p>
        </article>
        <article>
          <MessageCircle size={22} />
          <h2>Contact</h2>
          <p>Enquiries are stored for staff review and can notify the right team.</p>
        </article>
        <article>
          <ShieldCheck size={22} />
          <h2>Admission queue</h2>
          <p>Approved applications create student records and trigger credential dispatch.</p>
        </article>
      </section>

      <section className="contentGrid" id="blog">
        <div>
          <span className="eyebrow">Latest posts</span>
          <h2>Blog</h2>
        </div>
        <div className="postList">
          {posts.length === 0 && <p>No posts published yet — check back soon.</p>}
          {posts.map((post) => (
            <article className="postCard" key={post.id}>
              <h3>{post.title}</h3>
              <p>{post.body.slice(0, 160)}{post.body.length > 160 ? "…" : ""}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="splitBand" id="admission">
        <div>
          <span className="eyebrow">Admission registration</span>
          <h2>Application intake</h2>
          <p>Public submissions enter a review queue. Approval creates the student profile and optional portal login.</p>
        </div>
        <AdmissionForm />
      </section>

      <section className="contactBand" id="contact">
        <span className="eyebrow">Contact</span>
        <h2>Questions from families and community donors land in one staff queue.</h2>
        <ContactForm />
      </section>
    </main>
  );
}
