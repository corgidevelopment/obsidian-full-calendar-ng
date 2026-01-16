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

describe('CalDAVProvider', () => {
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

  it('should fetch events using a single REPORT request after validating URL', async () => {
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

    const mockReportResponse = `
      <d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
        <d:response>
          <d:href>/caldav/user/calendar/events/event1.ics</d:href>
          <d:propstat>
            <d:prop>
              <d:getetag>"12345"</d:getetag>
              <c:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event1
SUMMARY:Test Event 1
DTSTART:20230101T100000Z
DTEND:20230101T110000Z
END:VEVENT
END:VCALENDAR
</c:calendar-data>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;

    mockObsidianFetch
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(mockPropfindResponse)
      } as Response) // First call: PROPFIND
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(mockReportResponse)
      } as Response); // Second call: REPORT

    const events = await provider.getEvents();

    expect(mockObsidianFetch).toHaveBeenCalledTimes(2);

    // Verify PROPFIND
    expect(mockObsidianFetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('https://example.com/caldav/user/calendar/events/'),
      expect.objectContaining({
        method: 'PROPFIND',
        headers: expect.objectContaining({
          Depth: '0'
        }) as Record<string, unknown>
      })
    );

    // Verify REPORT
    expect(mockObsidianFetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('https://example.com/caldav/user/calendar/events/'),
      expect.objectContaining({
        method: 'REPORT',
        headers: expect.objectContaining({
          Depth: '1'
        }) as Record<string, unknown>,
        body: expect.stringContaining('<c:calendar-data/>') as string
      })
    );

    expect(events).toHaveLength(1);
    expect(events[0][0].title).toBe('Test Event 1');
  });

  it('should throw error if URL is not a calendar collection', async () => {
    const mockPropfindResponse = `
      <d:multistatus xmlns:d="DAV:">
        <d:response>
          <d:href>/caldav/user/calendar/events/</d:href>
          <d:propstat>
            <d:prop>
              <d:resourcetype>
                <d:collection/>
                <!-- No calendar tag -->
              </d:resourcetype>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;

    mockObsidianFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(mockPropfindResponse)
    } as Response);

    await expect(provider.getEvents()).rejects.toThrow('Invalid collection URL or not a calendar');
  });
});
