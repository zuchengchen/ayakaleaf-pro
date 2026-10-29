import type { DefaultNavbarMetadata } from '@/shared/components/types/default-navbar-metadata'
import NavDropdownMenu from '@/shared/components/navbar/nav-dropdown-menu'
import NavDropdownLinkItem from '@/shared/components/navbar/nav-dropdown-link-item'
import { useSendProjectListMB } from '@/features/project-list/components/project-list-events'

export default function AdminMenu({
  canDisplayAdminMenu,
  canDisplayAdminRedirect,
  canDisplayProjectUrlLookup,
  canDisplaySplitTestMenu,
  canDisplaySurveyMenu,
  canDisplayScriptLogMenu,
  adminUrl,
}: Pick<
  DefaultNavbarMetadata,
  | 'canDisplayAdminMenu'
  | 'canDisplayAdminRedirect'
  | 'canDisplayProjectUrlLookup'
  | 'canDisplaySplitTestMenu'
  | 'canDisplaySurveyMenu'
  | 'canDisplayScriptLogMenu'
  | 'adminUrl'
>) {
  const sendProjectListMB = useSendProjectListMB()
  return (
    <NavDropdownMenu
      title="Admin"
      className="subdued"
      onToggle={nextShow => {
        if (nextShow) {
          sendProjectListMB('menu-expand', {
            item: 'admin',
            location: 'top-menu',
          })
        }
      }}
    >
      {canDisplayAdminMenu ? (
        <>
          <NavDropdownLinkItem href="/admin">Manage Site</NavDropdownLinkItem>
          <NavDropdownLinkItem href="/admin/user">
            Manage Users
          </NavDropdownLinkItem>
          {/* LOCAL: AI gateways and models, from the ai-providers module */}
          <NavDropdownLinkItem href="/admin/ai-providers">
            Manage AI Providers
          </NavDropdownLinkItem>
          {/* LOCAL: free uses, VIP, prices and redeem codes, from the ai-billing module */}
          <NavDropdownLinkItem href="/admin/ai-billing">
            Manage AI Billing
          </NavDropdownLinkItem>
        </>
      ) : null}
      {canDisplayProjectUrlLookup ? (
        <NavDropdownLinkItem href="/admin/project">
          Project/Object Lookup
        </NavDropdownLinkItem>
      ) : null}
      {canDisplayAdminRedirect && adminUrl ? (
        <NavDropdownLinkItem href={adminUrl}>
          Switch to Admin
        </NavDropdownLinkItem>
      ) : null}
      {canDisplaySplitTestMenu ? (
        <NavDropdownLinkItem href="/admin/split-test">
          Manage Feature Flags
        </NavDropdownLinkItem>
      ) : null}
      {canDisplaySurveyMenu ? (
        <NavDropdownLinkItem href="/admin/survey">
          Manage Surveys
        </NavDropdownLinkItem>
      ) : null}
      {canDisplayScriptLogMenu ? (
        <NavDropdownLinkItem href="/admin/script-logs">
          View Script Logs
        </NavDropdownLinkItem>
      ) : null}
    </NavDropdownMenu>
  )
}
