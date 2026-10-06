import * as page0 from "@/server/pages/layout";
import * as page1 from "@/server/pages/home";
import * as page2 from "@/server/pages/account";
import * as page3 from "@/server/pages/admin";
import * as page4 from "@/server/pages/bin/[id]";
import * as page5 from "@/server/pages/demo";
import * as page6 from "@/server/pages/oauth/authorize";
import * as page7 from "@/server/pages/shared/bin/[token]";
import * as page8 from "@/server/pages/shared/request/[token]";
export const pages = [
  { path: "/", loader: page1.load },
  { path: "/account", loader: page2.load },
  { path: "/admin", loader: page3.load },
  { path: "/bin/[id]", loader: page4.load },
  { path: "/demo", loader: page5.load },
  { path: "/oauth/authorize", loader: page6.load },
  { path: "/shared/bin/[token]", loader: page7.load },
  { path: "/shared/request/[token]", loader: page8.load },
];
export const layoutLoader = page0.load;
export const consentActions = page6.actions;
