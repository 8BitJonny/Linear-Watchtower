import { Probot } from "probot";
import { ResultAsync } from 'neverthrow'
import helpers from "./helpers";

export = (app: Probot) => {
  app.on("issue_comment", async (context) => {
    if (context.payload.action == "deleted") return
    if (!context.payload.issue.pull_request) return
    if (context.payload.comment.body !== "!update") return
    
    const pullRequest = await ResultAsync.fromPromise(
      context.octokit.pulls.get({
        owner: context.payload.repository.full_name.split("/")[0],
        repo: context.payload.repository.full_name.split("/")[1],
        pull_number: context.payload.issue.number,
      }),
      () => new Error('Couldn\'t fetch PR')
    )
    if (pullRequest.isErr()) return console.error(pullRequest.mapErr(e => e))

    if (pullRequest.value.status !== 200) {
      return console.error(pullRequest.value.data)
    }

    const [ticketId, ticketName, isLinearBranch] = helpers.IsLinearBranch(pullRequest.value.data.head.ref)
    if (isLinearBranch) {
      // Update PR title from Linear Ticket
      const updatedPrValues: { title: string, body?: string} = {
        title: `${ticketId}: ${ticketName}`
      }

      // Update PR description to mention linear ticket
      if (pullRequest.value.data.body) {
        updatedPrValues.body = pullRequest.value.data.body.replace(
          /{linearSection}/gi,
          `Completes ${ticketId}\n\nhttps://linear.app/issue/${ticketId}`
        )
      }
      
      await context.octokit.pulls.update(
        context.pullRequest(updatedPrValues)
      );
    }
  });
};
