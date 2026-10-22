---
"@smthrs/integrations": minor
---

`GitHub.Collaborators.permission` answers the account's numeric id as `userId` when GitHub names one. A login can change hands after a rename, so a caller deciding a role compares `userId` with the id it knows before trusting the answer.
