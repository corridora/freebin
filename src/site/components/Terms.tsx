"use client";
import { Fragment, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { invalidateAll } from "@/components/AppShell";
import "./styles/Terms.css";

export default function Terms({ data = {}, form }: any) {
  return (
    <div data-view="Terms">
      <title>{"Terms and Conditions | freebin.org"}</title>
      <meta
        name="description"
        content="Terms, acceptable uses, public demo disclosure, and service limits for freebin.org."
      />

      <main className="terms">
        <header>
          <p className="eyebrow">{"EFFECTIVE JULY 29, 2026"}</p>
          <h1>{"Terms and Conditions"}</h1>
          <p>
            {
              "These terms explain what freebin.org is for, how captured requests are handled, and the rules that keep the shared service safe."
            }
          </p>
        </header>

        <section>
          <h2>{"1. What freebin.org is for"}</h2>
          <p>
            {
              "freebin.org is an HTTP request inspection and debugging service. You may use it to:"
            }
          </p>
          <ul>
            <li>
              {
                "test webhook deliveries and callbacks for systems you own or are authorized to test;"
              }
            </li>
            <li>
              {
                "inspect HTTP methods, headers, query parameters, and request bodies;"
              }
            </li>
            <li>{"debug API clients and third-party integrations;"}</li>
            <li>
              {
                "demonstrate webhook formats with synthetic, non-sensitive data; and"
              }
            </li>
            <li>
              {
                "teach or learn HTTP concepts using data you have the right to share."
              }
            </li>
          </ul>
          <p>
            {
              "It is not a production data store, secret manager, evidence archive, message queue, or endpoint for regulated, confidential, or safety-critical data."
            }
          </p>
        </section>

        <section>
          <h2>{"2. Public demo and anonymous use"}</h2>
          <p>
            {
              "The canonical demo bin is public and accepts requests through its published demo key. Its retained requests—including paths, headers after redaction, query parameters, bodies, timestamps, and bin names—appear in the shared public demo history. Source IP addresses are not shown publicly. Other bins created without a registered account are also public, but cannot capture new requests because they have no user-owned API key."
            }
          </p>
          <p>
            {
              "Automated redaction is best-effort and cannot identify every secret or personal-data format. Do not send passwords, API keys, authentication tokens, payment data, health data, government identifiers, private customer data, or any other information that should not be public."
            }
          </p>
        </section>

        <section>
          <h2>{"3. Registered use"}</h2>
          <p>
            {
              "Requests captured by bins owned by a registered user are private by default and accessible through authenticated account access. A user may explicitly create revocable public links. Registration may be paused to prevent abuse. Registration does not make freebin.org suitable for sensitive or regulated data."
            }
          </p>
        </section>

        <section>
          <h2>{"4. Service limits and retention"}</h2>
          <ul>
            <li>
              {
                "The canonical public demo allows 1 request per second, bodies up to 20 KB, and 1 MB of retained history. Other anonymous bins cannot capture new requests because every capture requires a user-owned API key."
              }
            </li>
            <li>
              {
                "Registered use allows 20 requests per second per user, up to 1 MB per request, and 5 MB of retention by default across the user’s bins."
              }
            </li>
            <li>
              {
                "Each registered account may have up to five bins and five active API keys. Every capture method requires a bearer API key belonging to the bin owner."
              }
            </li>
            <li>
              {
                "Registered retention limits may be configured individually in the database."
              }
            </li>
            <li>
              {
                "When a retention budget is exceeded, the oldest requests are deleted first. Deleted or evicted data cannot be recovered."
              }
            </li>
            <li>
              {
                "Limits may be enforced, reduced, or changed to protect service availability."
              }
            </li>
          </ul>
        </section>

        <section>
          <h2>{"5. Prohibited uses"}</h2>
          <p>
            {
              "You must not use freebin.org to break the law; violate privacy or intellectual-property rights; collect data without authorization; host or transmit malware; facilitate phishing, fraud, harassment, exploitation, or abuse; probe systems you do not own; disrupt the service; evade limits; create excessive automated traffic; or attempt unauthorized access to bins, accounts, infrastructure, or data."
            }
          </p>
        </section>

        <section>
          <h2>{"6. Your responsibility and permission"}</h2>
          <p>
            {
              "You are responsible for every request you direct to freebin.org and must have the rights and permissions needed to transmit its contents. You retain ownership of your content. You grant freebin.org only the limited permission needed to receive, process, redact, retain, display, export, and delete that content to operate the service, including public display of canonical demo requests."
            }
          </p>
        </section>

        <section>
          <h2>{"7. Availability, enforcement, and deletion"}</h2>
          <p>
            {
              "The service is provided on an “as available” basis without uptime, durability, or support guarantees. Access may be throttled, suspended, or terminated, and content may be removed, when reasonably necessary to enforce these terms, respond to abuse or legal obligations, or protect users and infrastructure."
            }
          </p>
        </section>

        <section>
          <h2>{"8. Disclaimers and liability"}</h2>
          <p>
            {
              "To the fullest extent permitted by law, freebin.org is provided without warranties of merchantability, fitness for a particular purpose, non-infringement, security, or data preservation. The service operators are not liable for lost data, public disclosure caused by anonymous use, service interruption, indirect damages, or reliance on captured data."
            }
          </p>
        </section>

        <section>
          <h2>{"9. Changes and contact"}</h2>
          <p>
            {
              "These terms may change as the service evolves. Material changes will be reflected by a new effective date on this page. Stop using the service if you do not accept an updated version. Questions or abuse reports may be submitted through the project’s public source repository."
            }
          </p>
        </section>

        <p className="closing">
          {
            "By creating a bin, registering, or continuing to use freebin.org, you agree to these Terms and Conditions."
          }
        </p>
      </main>
    </div>
  );
}
