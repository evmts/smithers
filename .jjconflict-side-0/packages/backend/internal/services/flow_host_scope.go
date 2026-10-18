package services

// ScopeFlowHosts switches off, off an install, the Flow hosts no hosted
// visitor path may start (PM d-nds5gd): a workflow-invoke host, which POST
// /invoke boots on a box whose developer has root, and flow-load, which every
// main move starts once a repository's stack runs. An install keeps both,
// flow-load behind its flag; no flag turns either on for hosted.
func ScopeFlowHosts(singleOwner, flowLoad bool, invoked *InvokedFlowService, mythical *MythicalService) {
	if invoked != nil {
		invoked.install = singleOwner
	}
	if mythical != nil {
		mythical.SetFlowLoad(flowLoad && singleOwner)
	}
}
