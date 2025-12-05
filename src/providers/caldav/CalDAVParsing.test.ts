/**
 * @jest-environment jsdom
 */
import { CalDAVProvider } from './CalDAVProvider';
import { obsidianFetch } from './obsidian-fetch_caldav';
import { CalDAVProviderConfig } from './typesCalDAV';
import FullCalendarPlugin from '../../main';

// Mock obsidianFetch
jest.mock('./obsidian-fetch_caldav', () => ({
  obsidianFetch: jest.fn()
}));

const mockObsidianFetch = obsidianFetch as jest.MockedFunction<typeof obsidianFetch>;

describe('CalDAVProvider Parsing', () => {
  let provider: CalDAVProvider;
  let mockPlugin: FullCalendarPlugin;
  const mockConfig: CalDAVProviderConfig = {
    id: 'caldav_1',
    name: 'Test Calendar',
    url: 'https://example.com/caldav/',
    homeUrl: 'https://example.com/caldav/user/calendar/events/',
    username: 'user',
    password: 'password'
  };

  beforeEach(() => {
    mockPlugin = {} as FullCalendarPlugin;
    provider = new CalDAVProvider(mockConfig, mockPlugin);
    mockObsidianFetch.mockReset();
  });

  it('should parse calendar-data with default namespace (iCloud format)', async () => {
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

    // This XML mimics the iCloud response where calendar-data has a default namespace
    // and is NOT prefixed with 'c:'.
    const mockReportResponse = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<multistatus xmlns="DAV:">
    <response>
        <href>/123456789/calendars/home/event1.ics</href>
        <propstat>
            <prop>
                <getetag xmlns="DAV:">"mfqm40n7"</getetag>
                <calendar-data xmlns="urn:ietf:params:xml:ns:caldav"><![CDATA[BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event1
SUMMARY:iCloud Event
DTSTART:20230101T100000Z
DTEND:20230101T110000Z
END:VEVENT
END:VCALENDAR
]]></calendar-data>
            </prop>
            <status>HTTP/1.1 200 OK</status>
        </propstat>
    </response>
</multistatus>`;

    mockObsidianFetch
      .mockResolvedValueOnce({
        status: 207,
        text: async () => mockPropfindResponse
      } as Response) // First call: PROPFIND
      .mockResolvedValueOnce({
        status: 207,
        text: async () => mockReportResponse
      } as Response); // Second call: REPORT

    const events = await provider.getEvents();

    // With the current regex /<c:calendar-data>([\s\S]*?)<\/c:calendar-data>/gi,
    // this should fail to find any events and return empty array (or fail if it tries to fallback to GETs which are mocked to return nothing here).
    // Actually, the current implementation falls back to GETs if 0 events found.
    // Since we didn't mock the GET requests, it might return empty or throw if it tries to fetch.
    // But wait, the fallback logic also uses regex to find hrefs: /<d:href[^>]*>([\s\S]*?)<\/d:href>/gi
    // The iCloud response has <href> without prefix (default namespace DAV:).
    // So the fallback will ALSO fail to find hrefs.

    expect(events).toHaveLength(1);
    expect(events[0][0].title).toBe('iCloud Event');
  });
});
