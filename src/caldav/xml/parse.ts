import { XMLParser } from "fast-xml-parser";

export function parseCalendars(body: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: true,
    allowBooleanAttributes: false,
    isArray: (jtag) => jtag === "cal:supported-calendar-component-set"
  });
  const parsed = parser.parse(body)["d:multistatus"]["d:response"];
  for (let cal of parsed) {
    const calHref =  cal["d:href"] as string;
    for (let stat of cal["d:propstat"]) {
      if (stat["d:status"].includes("200 OK")) {
        let props = stat["d:prop"]
        let displayname = tryparse(props, "d:displayname");
        let displayname = tryparse(props, "d:displayname");
        let displayname = tryparse(props, "d:displayname");
      }
    }
    console.log(cal["d:propstat"][0]["d:prop"]);
    console.log(cal["d:propstat"][0]["d:status"]);
    console.log(cal["d:propstat"][1]);
  }
}
