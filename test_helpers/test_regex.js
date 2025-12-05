const mockPropfindResponse = `
      <d:multistatus xmlns:d="DAV:">
        <d:response>
          <d:href>/caldav/user/calendar/events/</d:href>
          <d:propstat>
            <d:prop>
              <d:resourcetype>
                <d:collection/>
                <c:calendar xmlns:c="urn:ietf:params:xml:ns:caldav"/>
              </d:resourcetype>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;

const resourceTypeMatch = /<[^:]*:?resourcetype[^>]*>([\s\S]*?)<\/[^:]*:?resourcetype>/i.exec(mockPropfindResponse);
if (!resourceTypeMatch) {
  console.log('No resourcetype found');
} else {
  const resourceTypeContent = resourceTypeMatch[1];
  console.log('Content:', resourceTypeContent);
  const isCalendar = /<[^:]*:?calendar\b[^>]*>/i.test(resourceTypeContent);
  console.log('Is Calendar:', isCalendar);
}
