import { pluralize } from "../../ui/pluralize"
import { useState } from "react"
import { MOCK_NOW, settings } from "../../fixtures"
import { Empty } from "../../frame"
import { Box, PersonChip, RelTime, Row, toast } from "../../ui"
import { ConfirmCard, Field, FormCard, Save, SettingsHeading, useDraft, useSettingsCommands } from "./shared"

type Role = "owner" | "member"
type Invite = { login: string; role: Role; sent: string }

export const MembersEmpty = () => <Empty title="No members." />
export const InvitesEmpty = () => <Empty title="No pending invites." />

export const MembersReady = ({ empty = false, emptyInvites = false }: {
  empty?: boolean
  emptyInvites?: boolean
}) => {
  const members = useDraft(empty ? [] : settings.members.map(member => ({ ...member })))
  const [invites, setInvites] = useState<Invite[]>(empty || emptyInvites ? [] : settings.invites)
  const [inviting, setInviting] = useState(false)
  const [login, setLogin] = useState("")
  const [role, setRole] = useState<Role>("member")
  const [removing, setRemoving] = useState<string | null>(null)
  useSettingsCommands({
    "member.invite": {
      purpose: "Invite a member",
      fields: [
        { name: "login", label: "GitHub login", required: false },
        { name: "role", label: "Role", options: ["member", "owner"], required: false }
      ],
      confirm: false,
      run: (values, context) => {
        setLogin(values.login ?? "")
        setRole(values.role === "owner" ? "owner" : "member")
        setInviting(true)
        context.closeAsk()
      }
    },
    "member.role": {
      purpose: "Change member role",
      fields: [
        { name: "login", label: "GitHub login" },
        { name: "role", label: "Role", options: ["owner", "member"] }
      ],
      confirm: false,
      run: values => {
        const member = members.value.find(item => item.login === values.login)
        if (!member) throw new Error("Member not found.")
        if (member.role === "owner" && values.role !== "owner"
          && members.value.filter(item => item.role === "owner").length === 1) {
          throw new Error("Add another owner before changing the last owner's role.")
        }
        members.setValue(current => current.map(item => item.login === values.login
          ? { ...item, role: values.role as Role } : item))
      }
    },
    "member.remove": {
      purpose: "Remove a member",
      fields: [{ name: "login", label: "GitHub login" }],
      confirm: false,
      run: ({ login }, context) => {
        const member = members.value.find(item => item.login === login)
        if (!member) throw new Error("Member not found.")
        if (member.role === "owner" && members.value.filter(item => item.role === "owner").length === 1) {
          throw new Error("Add another owner before removing the last owner.")
        }
        setRemoving(login)
        context.closeAsk()
      }
    },
    "member.revoke": {
      purpose: "Revoke an invite",
      fields: [{ name: "login", label: "GitHub login" }],
      run: ({ login }) => {
        if (!invites.some(invite => invite.login === login)) throw new Error("Invite not found.")
        setInvites(current => current.filter(invite => invite.login !== login))
        toast("Invite revoked.")
      }
    }
  })
  return (
    <>
      <SettingsHeading title="Members">
        {!inviting && (
          <button
            className={`repo-ui-btn${members.dirty ? "" : " repo-ui-btn-primary"}`}
            title="/member.invite"
            onClick={() => setInviting(true)}
          >
            Invite
          </button>
        )}
      </SettingsHeading>
      {inviting && (
        <FormCard
          title="Invite a member"
          command={`/member.invite ${login} ${role}`}
          submit="Send invite"
          onCancel={() => setInviting(false)}
          onSubmit={event => {
            event.preventDefault()
            setInvites(current => [...current, { login: login.trim(), role, sent: MOCK_NOW }])
            setInviting(false)
            setLogin("")
            toast("Invite sent.")
          }}
        >
          <Field label="GitHub login">
            <input
              autoFocus
              className="repo-ui-input"
              value={login}
              onChange={event => {
                const value = event.target.value
                setLogin(value)
                event.target.setCustomValidity(
                  [...members.value, ...invites].some(member => member.login.toLowerCase() === value.trim().toLowerCase())
                    ? "This person is already a member or has an invite." : ""
                )
              }}
              pattern="[A-Za-z0-9][A-Za-z0-9-]{0,38}"
              autoComplete="off"
              required
            />
          </Field>
          <Field label="Role">
            <select className="repo-ui-input" value={role} onChange={event => setRole(event.target.value as Role)}>
              <option value="member">Member</option>
              <option value="owner">Owner</option>
            </select>
          </Field>
        </FormCard>
      )}
      <form
        id="repo-settings-members"
        onSubmit={event => {
          event.preventDefault()
          members.save()
        }}
      >
        <Box header={`${members.value.length} ${pluralize(members.value.length, "member")}`}>
          {members.value.length === 0 ? <MembersEmpty /> : members.value.map(member => {
            const lastOwner = member.role === "owner"
              && members.value.filter(item => item.role === "owner").length === 1
            return (
              <Row key={member.login} className="repo-settings-row">
                <div className="repo-settings-grow">
                  <PersonChip login={member.login} />
                  <p className="repo-settings-muted">Joined <RelTime date={member.added} /></p>
                </div>
                <label className="repo-settings-role">
                  <span className="repo-ui-sr">Role for {member.login}</span>
                  <select
                    className="repo-ui-input"
                    value={member.role}
                    title={`/member.role ${member.login}`}
                    onChange={event => {
                      const nextRole = event.target.value as Role
                      members.setValue(current => current.map(item => item.login === member.login
                        ? { ...item, role: nextRole } : item))
                    }}
                  >
                    <option value="owner">Owner</option>
                    <option value="member" disabled={lastOwner}>Member</option>
                  </select>
                </label>
                {!lastOwner && (
                  <button
                    type="button"
                    className="repo-ui-btn repo-ui-btn-quiet repo-settings-danger-button"
                    title={`/member.remove ${member.login}`}
                    onClick={() => setRemoving(member.login)}
                  >
                    Remove
                  </button>
                )}
              </Row>
            )
          })}
        </Box>
        {members.dirty && !inviting && (
          <div className="repo-settings-save-row">
            <Save form="repo-settings-members" dirty={members.dirty} section="members" />
          </div>
        )}
      </form>
      {removing && (
        <ConfirmCard
          title={`Remove ${removing}?`}
          detail="They will lose member access to this repository."
          command={`/member.remove ${removing}`}
          label="Remove member"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            members.setValue(current => current.filter(member => member.login !== removing))
            setRemoving(null)
            toast("Member removed.")
          }}
        />
      )}
      <section className="repo-settings-subsection">
        <h2>Pending invites</h2>
        <Box>
          {invites.length === 0 ? <InvitesEmpty /> : invites.map(invite => (
            <Row key={invite.login} className="repo-settings-row">
              <div className="repo-settings-grow">
                <PersonChip login={invite.login} />
                <p className="repo-settings-muted">{invite.role} · Sent <RelTime date={invite.sent} /></p>
              </div>
              <button
                className="repo-ui-btn repo-ui-btn-quiet"
                title={`/member.revoke ${invite.login}`}
                onClick={() => {
                  setInvites(current => current.filter(item => item.login !== invite.login))
                  toast("Invite revoked.")
                }}
              >
                Revoke
              </button>
            </Row>
          ))}
        </Box>
      </section>
    </>
  )
}
