import * as route0 from "@/server/routes/api/v1/bins/[id]/interactions/[requestId]/export/handler";
import * as route1 from "@/server/routes/api/v1/bins/[id]/interactions/[requestId]/forwarding/handler";
import * as route2 from "@/server/routes/api/v1/bins/[id]/interactions/[requestId]/replay/handler";
import * as route3 from "@/server/routes/api/v1/bins/[id]/interactions/[requestId]/share/handler";
import * as route4 from "@/server/routes/api/v1/bins/[id]/rules/test/handler";
import * as route5 from "@/server/routes/api/v1/bins/[id]/audit/handler";
import * as route6 from "@/server/routes/api/v1/bins/[id]/collaborators/handler";
import * as route7 from "@/server/routes/api/v1/bins/[id]/config/handler";
import * as route8 from "@/server/routes/api/v1/bins/[id]/export/handler";
import * as route9 from "@/server/routes/api/v1/bins/[id]/interactions/handler";
import * as route10 from "@/server/routes/api/v1/bins/[id]/interactions/[requestId]/handler";
import * as route11 from "@/server/routes/api/v1/bins/[id]/rules/handler";
import * as route12 from "@/server/routes/api/v1/bins/[id]/rules/[ruleId]/handler";
import * as route13 from "@/server/routes/api/v1/bins/[id]/share/handler";
import * as route14 from "@/server/routes/api/v1/bins/[id]/stream/handler";
import * as route15 from "@/server/routes/api/account/token/handler";
import * as route16 from "@/server/routes/api/auth/login/handler";
import * as route17 from "@/server/routes/api/auth/logout/handler";
import * as route18 from "@/server/routes/api/auth/register/handler";
import * as route19 from "@/server/routes/api/v1/bins/handler";
import * as route20 from "@/server/routes/api/v1/bins/[id]/handler";
import * as route21 from "@/server/routes/api/config/handler";
import * as route22 from "@/server/routes/api/me/handler";
import * as route23 from "@/server/routes/b/[id]/[...path]/handler";
import * as route24 from "@/server/routes/mcp/handler";
export const routes = [
  {
    path: "/api/v1/bins/[id]/interactions/[requestId]/export",
    handlers: route0,
  },
  {
    path: "/api/v1/bins/[id]/interactions/[requestId]/forwarding",
    handlers: route1,
  },
  {
    path: "/api/v1/bins/[id]/interactions/[requestId]/replay",
    handlers: route2,
  },
  {
    path: "/api/v1/bins/[id]/interactions/[requestId]/share",
    handlers: route3,
  },
  { path: "/api/v1/bins/[id]/rules/test", handlers: route4 },
  { path: "/api/v1/bins/[id]/audit", handlers: route5 },
  { path: "/api/v1/bins/[id]/collaborators", handlers: route6 },
  { path: "/api/v1/bins/[id]/config", handlers: route7 },
  { path: "/api/v1/bins/[id]/export", handlers: route8 },
  { path: "/api/v1/bins/[id]/interactions", handlers: route9 },
  { path: "/api/v1/bins/[id]/interactions/[requestId]", handlers: route10 },
  { path: "/api/v1/bins/[id]/rules", handlers: route11 },
  { path: "/api/v1/bins/[id]/rules/[ruleId]", handlers: route12 },
  { path: "/api/v1/bins/[id]/share", handlers: route13 },
  { path: "/api/v1/bins/[id]/stream", handlers: route14 },
  { path: "/api/account/token", handlers: route15 },
  { path: "/api/auth/login", handlers: route16 },
  { path: "/api/auth/logout", handlers: route17 },
  { path: "/api/auth/register", handlers: route18 },
  { path: "/api/v1/bins", handlers: route19 },
  { path: "/api/v1/bins/[id]", handlers: route20 },
  { path: "/api/config", handlers: route21 },
  { path: "/api/me", handlers: route22 },
  { path: "/b/[id]/[...path]", handlers: route23 },
  { path: "/mcp", handlers: route24 },
];
