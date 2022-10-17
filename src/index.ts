import { Probot } from "probot";
import { ResultAsync } from 'neverthrow'
import helpers from "./helpers";
import { Endpoints } from "@octokit/types"

const sectionRegex = (section: string) => new RegExp(`(?:\\x3C|<)!---\r\n<${section}>\r\n-->\r\n((?:.*\r\n)*)(?:\\x3C|<)!---\r\n<\/${section}>\r\n-->`, 'gi')
const wrapSection = (section: string, content: string) => `<!---\r\n<${section}>\r\n-->\r\n${content}\r\n<!---\r\n<\/${section}>\r\n-->`

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
    if (pullRequest.value.status !== 200) return console.error(pullRequest.value.data)

    const [ticketId, ticketName, isLinearBranch] = helpers.IsLinearBranch(pullRequest.value.data.head.ref)
    if (isLinearBranch) {
      // Update PR title from Linear Ticket
      const updatedPrValues: { title: string, body?: string} = {
        title: `${ticketId}: ${ticketName}`
      }

      // Update PR description to mention linear ticket
      if (pullRequest.value.data.body) {
        updatedPrValues.body = pullRequest.value.data.body.replace(
          sectionRegex('linearTickets'),
          wrapSection('linearTickets',
            `Completes ${ticketId}\n\nhttps://linear.app/issue/${ticketId}`
          )
        )
      }
      await context.octokit.pulls.update(
        context.pullRequest(updatedPrValues)
      );
    }

    const allOrgPullRequest = await context.octokit.repos.listForOrg({
      org: context.payload.repository.full_name.split("/")[0]
    }).then((orgReposResponse): Promise<Endpoints["GET /repos/{owner}/{repo}/pulls"]["response"][]> => {
      return Promise.all(orgReposResponse.data.map((repo): Promise<Endpoints["GET /repos/{owner}/{repo}/pulls"]["response"]> => {
        return context.octokit.pulls.list({
          owner: repo.owner.login,
          repo: repo.name,
        })
      }))
    }).then((orgRepos): { org: string, repo: string, pr: number, body: string }[][] => {
      return orgRepos.map((repoPullRequests): { org: string, repo: string, pr: number, body: string }[] => {
        return repoPullRequests.data.map((pullRequest): { org: string, repo: string, pr: number, body: string } => {
          return {
            org: pullRequest.base.repo.full_name.split("/")[0],
            repo: pullRequest.base.repo.full_name.split("/")[1],
            pr: pullRequest.number,
            body: pullRequest.body || "",
          }
        })
      })
    })

    const prIssuesMap: Map<String, Set<{ org: string, repo: string, pr: number, body: string }>> = new Map
    allOrgPullRequest.forEach(repos => {
      repos.forEach(repo => {
        const mentionedIssues: string[] = []

        const matches = repo.body.matchAll(/(https:\/\/linear.app\/issue\/[\da-zA-Z-]+)/gm)
        let match = matches.next();
        while (!match.done) {
          mentionedIssues.push(match.value[0])
          match = matches.next();
        }

        mentionedIssues.forEach(issue => {
          if (!repo.body) return
          if (!prIssuesMap.has(issue)) {
            prIssuesMap.set(issue, new Set())
          }
          prIssuesMap.get(issue)?.add(repo)
        })
      })
    })

    const reposToUpdate: Map<{ org: string, repo: string, pr: number, body: string }, Set<string>> = new Map
    prIssuesMap.forEach((prs) => {
      if (prs.size < 2) return
      const prArray: { org: string, repo: string, pr: number, body: string }[] = [...prs]

      prArray.forEach((pr, index) => {
        if (!reposToUpdate.has(pr)) {
          reposToUpdate.set(pr, new Set())
        }
        const relatedPrs = prArray.filter((_, i) => i != index)
        
        relatedPrs.forEach(({ org, repo, pr: prNumber }) => {
          reposToUpdate.get(pr)?.add(
            ["- https://github.com", org, repo, "pull", prNumber].join("/")
          )
        })
      })
    })
    
    reposToUpdate.forEach((relatedPrs, repo) => {
      context.octokit.pulls.update(
        context.pullRequest({
          owner: repo.org,
          repo: repo.repo,
          pull_number: repo.pr,
          body: repo.body.replace(
            sectionRegex('relatedPrs'),
            wrapSection('relatedPrs',
              [...relatedPrs].join("\n")
            )
          )
        })
      );
    })
  });
};
