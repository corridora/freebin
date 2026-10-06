"use client";

import { useEffect } from "react";

type RumConfig = {
  rumScriptUrl?: string;
  rumAppName?: string;
  appVersion?: string;
  deploymentEnvironment?: string;
};

function sendElementCount(config: RumConfig) {
  if (!config.rumScriptUrl) return;
  const source = new URL(config.rumScriptUrl, location.origin);
  const ingestKey = source.searchParams.get("ckid");
  if (!ingestKey) return;

  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const timeUnixNano = (BigInt(Date.now()) * 1_000_000n).toString();
      const resourceAttributes = [
        { key: "service.namespace", value: { stringValue: "freebin" } },
        {
          key: "service.name",
          value: { stringValue: config.rumAppName || "freebin-web" },
        },
        {
          key: "deployment.environment.name",
          value: { stringValue: config.deploymentEnvironment || "production" },
        },
        ...(config.appVersion
          ? [
              {
                key: "service.version",
                value: { stringValue: config.appVersion },
              },
            ]
          : []),
      ];
      const body = JSON.stringify({
        resourceMetrics: [
          {
            resource: { attributes: resourceAttributes },
            scopeMetrics: [
              {
                scope: {
                  name: "freebin.browser",
                  version: config.appVersion || "unknown",
                },
                metrics: [
                  {
                    name: "browser.dom.element.count",
                    description:
                      "Number of DOM elements on the page after initial render",
                    unit: "{element}",
                    gauge: {
                      dataPoints: [
                        {
                          timeUnixNano,
                          asInt: String(document.querySelectorAll("*").length),
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
      });

      void fetch("https://ingest.corridora.com/v1/metrics", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-corridora-key": ingestKey,
          "x-corridora-ingest-source": "rum",
        },
        body,
        keepalive: true,
        mode: "cors",
      }).catch(() => undefined);
    }),
  );
}

export default function Rum() {
  useEffect(() => {
    fetch("/api/config")
      .then((response) => response.json() as Promise<RumConfig>)
      .then((config) => {
        if (
          !config.rumScriptUrl ||
          document.querySelector("script[data-freebin-rum]")
        )
          return;

        const source = new URL(config.rumScriptUrl, location.origin);
        if (!source || !source.href) return;
        const script = document.createElement("script");
        script.src = source.href;
        script.defer = true;
        script.dataset.freebinRum = "true";
        script.dataset.endpoint = "https://ingest.corridora.com";
        script.dataset.service = config.rumAppName || "freebin-web";
        script.dataset.serviceNamespace = "freebin";
        script.dataset.env = config.deploymentEnvironment || "production";
        if (config.appVersion) script.dataset.version = config.appVersion;
        script.addEventListener("load", () => sendElementCount(config), {
          once: true,
        });
        document.head.appendChild(script);
      })
      .catch(() => undefined);
  }, []);

  return null;
}
