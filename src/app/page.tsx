import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ArrowDown, Check, Plus, Target, FileText, ListChecks, TrendingUp } from "lucide-react";
import { currentUser } from "@/lib/session";
import s from "./home.module.css";

export const metadata: Metadata = {
  title: "AIRS | Competitor Analysis for AI Search",
  description: "Compare your website with competitors found through AI search. Find content gaps and turn their weaknesses into a clear website improvement plan with AIRS.",
};

const faqs = [
  ["What does AIRS do?", "AIRS compares your website with competing pages found through AI search. It identifies missing or incomplete answers and turns those findings into a practical website improvement plan."],
  ["How does AIRS find my competitors?", "AIRS uses your selected customer questions and target market to search with AI, then gathers up to 10 competing sources. These can include business websites, directories, or information pages. Sources can change with the question and search run."],
  ["How does AIRS find competitor weaknesses?", "It reads available pages and checks whether they answer your selected questions clearly, mention the topic without enough detail, or leave it unanswered. Page evidence helps you review the findings."],
  ["Does AIRS compare my website too?", "Yes. AIRS compares your available pages with competing pages so you can see your strengths, your own missing answers, and opportunities you already cover. A page that cannot be read is missing evidence, not proof of a weakness."],
  ["What is content gap analysis?", "Content gap analysis looks for information your audience needs that existing pages do not adequately cover. AIRS focuses on customer questions and useful details such as costs, timelines, inclusions, and next steps."],
  ["What do I get after an analysis?", "You get an evaluation with comparisons and findings, a coverage view of customer questions, and recommended improvements. Content briefs explain what to include, while missions organise the work into tasks."],
  ["Can AIRS work for my industry and location?", "AIRS is designed to work across industries using your website, questions, and target market. The usefulness of the findings depends on the questions selected and pages available. Industry-specific facts still need review by someone who knows the business."],
  ["Does AIRS make the website changes for me?", "AIRS provides guidance, content briefs, and tasks. You or your website team review the recommendations, add accurate business information, and publish the changes."],
  ["How do I know whether my improvements helped?", "Run the analysis again after publishing your changes. Benchmarks compare saved runs to show questions answered, gaps closed, and competitor changes. Better page coverage alone does not prove that AI systems recommend your business more often."],
  ["Can AIRS guarantee that I will beat competitors or appear in AI answers?", "No. AIRS helps you identify opportunities and make informed improvements. AI answers vary, and stronger content does not guarantee a particular ranking or recommendation."],
];

function Cta() {
  return <Link className={s.button} href="/contact">Request an analysis <ArrowRight size={18} aria-hidden="true" /></Link>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <p className={s.label}>{children}</p>;
}
function Status({ value }: { value: string }) {
  return <span className={`${s.status} ${value === "Answered" ? s.good : value === "Incomplete" ? s.partial : s.missing}`}>{value}</span>;
}

export default async function Home() {
  if (await currentUser()) redirect("/dashboard");
  return (
    <div className={s.home}>
      <section className={`${s.section} ${s.hero}`} aria-labelledby="home-title">
        <div className={s.grid}>
          <div>
            <Label>Competitor analysis for AI search</Label>
            <h1 id="home-title">Understand your competitors.<br /><em>Make your next move count.</em></h1>
            <p className={s.lead}>Find the answers competing websites are missing. Turn their weaknesses into a clear plan for improving yours.</p>
            <p className={s.body}>AIRS connects competitor research to practical actions, so every website improvement starts with a reason.</p>
            <div className={s.actions}><Cta /><a href="#comparison" className={s.textLink}>See how it works <ArrowDown size={16} aria-hidden="true" /></a></div>
          </div>
          <div className={s.opportunity}>
            <div className={s.cardTop}><span><Target size={17} aria-hidden="true" /> Your next opportunity</span><span className={s.example}>Illustrative example</span></div>
            <p className={s.question}>“How long does installation take?”</p>
            <div className={s.signal}><span className={s.dot} /><div><small>COMPETITOR WEAKNESS</small><h3>The service is explained.<br />The timeline isn’t.</h3><p>Customers still don’t know what to expect.</p></div></div>
            <div className={s.connection}><ArrowDown size={20} aria-hidden="true" /></div>
            <div className={s.nextMove}><span className={s.miniLabel}>YOUR NEXT MOVE</span><h3>Give customers a clear timeline.</h3><p>Explain each stage, typical durations, and what could cause delays.</p><div className={s.tags}><span>Content gap</span><span>Page improvement</span></div></div>
            <p className={s.cardFoot}>A weakness you can understand. An action you can take.</p>
          </div>
        </div>
        <div className={s.sectionFoot}><span>RESEARCH → OPPORTUNITY → ACTION → PROGRESS</span><a href="#comparison">Explore AIRS <ArrowDown size={14} aria-hidden="true" /></a></div>
      </section>

      <section id="comparison" className={s.section} aria-labelledby="comparison-title">
        <div className={s.container}>
          <Label>01 / Understand the field</Label>
          <div className={s.headingRow}><h2 id="comparison-title">See where they’re strong.<br /><em>Find where they fall short.</em></h2><p className={s.body}>Start with your website, market, and customer questions. AIRS finds up to 10 competing sources through AI search and compares their available pages with yours.</p></div>
          <div className={s.tableCard}>
            <div className={s.cardTop}><span>Website competitor analysis</span><span className={s.example}>Illustrative example</span></div>
            <div className={s.tableScroll} tabIndex={0} role="region" aria-label="Example competitor comparison, scroll horizontally on small screens"><table><caption className={s.srOnly}>Example customer question coverage across three websites</caption><thead><tr><th scope="col">Customer question</th><th scope="col">Your website</th><th scope="col">Competitor A</th><th scope="col">Competitor B</th></tr></thead><tbody>{[
              ["What does it cost?", "Incomplete", "Incomplete", "Unanswered"],
              ["How long does it take?", "Unanswered", "Answered", "Incomplete"],
              ["What is included?", "Answered", "Incomplete", "Answered"],
            ].map(([q, ...values]) => <tr key={q}><th scope="row">{q}</th>{values.map((v, i) => <td key={i}><Status value={v} /></td>)}</tr>)}</tbody></table></div>
            <p className={s.tableNote}>Your strengths matter too. Focus on gaps that are relevant to your customers and worth improving.</p>
          </div>
          <p className={s.note}>Competing sources can include businesses, directories, and information pages. Results vary by question, market, and search run.</p>
        </div>
      </section>

      <section className={`${s.section} ${s.dark}`} aria-labelledby="gaps-title">
        <div className={s.container}>
          <Label>02 / Find the opening</Label>
          <h2 id="gaps-title">Their missing answer.<br /><em>Your chance to be more useful.</em></h2>
          <p className={s.lead}>Content gap analysis turns a vague “we should improve our website” into a specific customer question you could answer better.</p>
          <p className={s.example}>Illustrative example · Property management</p>
          <div className={s.threeCards}>
            <article><span className={s.step}>01</span><h3>The customer asks</h3><p className={s.largeQuote}>“What is included in the management fee?”</p></article>
            <article><span className={s.step}>02</span><h3>The competing page says</h3><blockquote>“We offer a complete property management service.”</blockquote><p>That describes the service, but leaves the inclusions and extra charges unclear.</p><small>Sample passage · not a live finding</small></article>
            <article className={s.highlightCard}><span className={s.step}>03</span><h3>Your opportunity</h3><p className={s.largeQuote}>Make the details easy to compare.</p><p>Explain included services, optional extras, and what affects the fee, using your real business information.</p></article>
          </div>
          <p className={s.note}>AIRS checks your pages too, so you can see whether you already fill the gap.</p>
        </div>
      </section>

      <section className={`${s.section} ${s.soft}`} aria-labelledby="action-title">
        <div className={s.grid}>
          <div><Label>03 / Make your move</Label><h2 id="action-title">Know what to change.<br /><em>And what to put there.</em></h2><p className={s.lead}>A content improvement plan your team can actually work through.</p><div className={s.workflow}>{[
            [Target, "Evaluation & coverage", "Understand the comparison and the questions that need better answers."],
            [FileText, "Content briefs", "Get guidance on the page, heading, answer format, and details to include."],
            [ListChecks, "Missions", "Turn recommendations into clear tasks and organise the work."],
          ].map(([Icon, title, body]) => { const Component = Icon as typeof Target; return <div key={String(title)}><Component size={21} aria-hidden="true" /><div><h3>{String(title)}</h3><p>{String(body)}</p></div></div>; })}</div></div>
          <div className={s.brief}><div className={s.cardTop}><span><FileText size={17} aria-hidden="true" /> Content brief</span><span className={s.example}>Illustrative example</span></div><div className={s.briefBody}><Label>Page to improve · Installation service</Label><h3>How long does installation take?</h3><p>Add a clear timeline that helps customers plan ahead.</p><div className={s.briefMeta}><span>FORMAT<strong>Step-by-step timeline</strong></span><span>PURPOSE<strong>Answer before enquiry</strong></span></div><h4>What to include</h4><ul>{["Typical duration based on your actual work", "The stages customers should expect", "Factors that may cause delays", "What customers need to do next"].map(item => <li key={item}><Check size={17} aria-hidden="true" />{item}</li>)}</ul><div className={s.briefTask}><ListChecks size={19} aria-hidden="true" /><span>Mission task<strong>Update the service page and review the facts.</strong></span></div><p className={s.note}>Your team supplies accurate facts and publishes the changes. AIRS provides the direction.</p></div></div>
        </div>
      </section>

      <section className={s.section} aria-labelledby="progress-title">
        <div className={s.grid}><div><Label>04 / Check the difference</Label><h2 id="progress-title">Do the work.<br /><em>See what changed.</em></h2><p className={s.lead}>Use competitor benchmarking to compare saved analyses after you update your website.</p><p className={s.body}>See which questions you now answer, which gaps remain, and where competitors have improved.</p><div className={s.definitions}><p><strong>Dashboard</strong>Your snapshot today.</p><p><strong>Benchmarks</strong>Your movement between runs.</p></div></div><div className={s.progressCard}><div className={s.cardTop}><span><TrendingUp size={18} aria-hidden="true" /> Progress between analyses</span><span className={s.example}>Illustrative example</span></div>{[
          ["Installation timeline", "Unanswered", "Answered", "Your updated page explains the stages and timing."],
          ["What the service includes", "Incomplete", "Answered", "Your page now lists inclusions and exclusions."],
        ].map(([title, before, after, body]) => <div className={s.movement} key={title}><h3>{title}</h3><div><Status value={before} /><ArrowRight size={17} aria-label="changed to" /><Status value={after} /></div><p>{body}</p></div>)}<div className={s.rival}><strong>Keep an eye on the field</strong><p>A competitor now explains its pricing. Review whether your own answer still gives customers enough detail.</p></div><p className={s.tableNote}>Page improvements and appearances in AI answers are separate measures. One does not prove the other.</p></div></div>
      </section>

      <section className={`${s.section} ${s.soft}`} aria-labelledby="faq-title">
        <div className={s.faqGrid}><div><Label>05 / A little more clarity</Label><h2 id="faq-title">Good questions.<br /><em>Clear answers.</em></h2><p className={s.body}>What AIRS does, what you get, and how to use the findings.</p><Link className={s.textLink} href="/contact">Have another question? <ArrowRight size={17} aria-hidden="true" /></Link></div><div className={s.faqs}>{faqs.map(([question, answer], index) => <details key={question} open={index === 0}><summary><span>{question}</span><Plus size={18} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div></div>
      </section>

      <section className={`${s.section} ${s.close}`} aria-labelledby="contact-title"><div className={s.closeInner}><Label>Your next move starts here</Label><h2 id="contact-title">Find what your<br />competitors are <em>missing.</em></h2><p className={s.lead}>Share your website and target market. Discover where competing pages fall short and what you could improve on yours.</p><Cta /><p className={s.note}>A clearer direction for your website. Backed by competitor research.</p></div></section>
    </div>
  );
}
