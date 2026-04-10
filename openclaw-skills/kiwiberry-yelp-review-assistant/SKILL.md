---
name: kiwiberry-yelp-review-assistant
description: Use the local Kiwiberry CLI to monitor Yelp reviews for tracked businesses, fetch new reviews through OpenClaw, inspect stored reviews and prior drafts, save draft responses back into Kiwiberry, and prepare operator-friendly email digests for new-review alerts. Use when the user wants to check for new Yelp reviews, review recent feedback, draft business-safe Yelp responses, or automate review-monitoring emails.
---

# Kiwiberry Yelp review assistant

Use this skill when the user wants Yelp review monitoring or reply drafting through the local `kiwiberry` CLI.

## Preconditions

- `kiwiberry` must be available on `PATH`
- `openclaw` must be available on `PATH` for any `fetch` workflow
- Treat `stdout` from `kiwiberry` as JSON
- Treat `stderr` from `kiwiberry` as human-readable status or error text

## Command workflow

Prefer this order unless the user has already narrowed the task to a later step.

### 1. Discover tracked businesses

Run:

```bash
kiwiberry business list
```

Use this before asking the user for a business ID.

- If there are no tracked businesses and the user provided a business name plus canonical Yelp business URL, register it with `kiwiberry business add "<name>" "<yelp-url>"`
- If there are multiple tracked businesses and the user did not specify one, ask which tracked business to use

### 2. Fetch new reviews

When the user asks to check for new Yelp reviews or sync the latest feedback, run:

```bash
kiwiberry fetch -b <businessId>
```

If the user explicitly asks for a deeper scrape, add `--pages <N>`.

Interpret results as follows:

- Non-empty JSON array: these are newly stored reviews
- Empty JSON array: no new reviews were added
- Error mentioning `openclaw` installation: explain that review fetching depends on the OpenClaw browser CLI

### 3. Inspect stored reviews

Run:

```bash
kiwiberry reviews -b <businessId>
```

Use this after `fetch` or whenever the user wants to browse existing review history.

Pay attention to:

- `id`: the review ID used by response commands
- `rating`: sentiment signal
- `reviewerName`, `reviewText`, `postedAtIso`: context for drafting

### 4. Check existing drafts before writing a new one

Before drafting a fresh reply for a review, run:

```bash
kiwiberry responses <reviewId>
```

If drafts already exist, summarize them and only create another one if the user still wants a new draft.

### 5. Save draft responses

This skill saves drafts into Kiwiberry instead of only composing them in chat.

For a single-line draft:

```bash
kiwiberry respond <reviewId> "<draft text>"
```

For a multiline draft, pipe text on stdin:

```bash
printf '%s\n' "<line 1>" "<line 2>" | kiwiberry respond <reviewId>
```

After saving, report:

- which business and review were used
- that the response was saved as a draft
- the draft text that was saved

Do not claim the message was posted to Yelp. Kiwiberry stores drafts only.

When the workflow is for outbound review monitoring, prefer saving three drafts per new review unless the user asked for a different count.

### 6. Prepare an email digest for operators

When the user wants review alerts by email, send one digest per fetch run only when new reviews were found.

Preferred structure:

- Subject: `<business name> Yelp review alert — <N> new review` or `... <N> new reviews`
- First line: short forwardable summary, for example `Forwardable update for ops: <business name> received <N> new Yelp review(s).`
- For each review, include in this order:
  1. reviewer name
  2. rating
  3. posted date
  4. direct Yelp business URL when helpful
  5. full review text
  6. exactly three labeled draft responses
- Separate reviews with a clear divider such as `==========`
- End with a short operator note such as `Drafts are saved in Kiwiberry for reuse/editing.`

Formatting rules:

- Prefer plain text over HTML for easy forwarding
- Make the subject scannable from an inbox view
- Put the business name, review count, and source (`Yelp`) in the subject
- Keep the top summary to 1-2 lines so an operator can forward without editing much
- Avoid giant prose blocks; use labels and spacing so the email can double as an internal handoff

If Mail app sending is available and the user approved email delivery, use AppleScript/`osascript` to send via the local Mail app.

## Drafting rules

Keep responses professional, specific, and safe for a small business owner to review before posting.

- Acknowledge the customer by name when available
- Reference the substance of the review instead of using a generic template
- Thank positive reviewers directly and briefly
- For mixed or negative reviews, acknowledge the issue and use a calm, non-defensive tone
- Do not invent refunds, credits, investigations, policy changes, or outreach that did not happen
- Move sensitive remediation offline when appropriate
- Avoid legal claims, blame, sarcasm, or arguments with the reviewer
- Keep the draft concise unless the user explicitly asks for a longer response

## Error handling

Handle common failures directly:

- `Business not found: <id>`: verify the business ID with `kiwiberry business list`
- `Review not found: <id>`: verify the review ID with `kiwiberry reviews -b <businessId>`
- `Response text must not be empty`: regenerate a non-empty draft and retry
- `openclaw CLI is not installed`: explain that `fetch` depends on OpenClaw and stop the fetch flow
- Empty fetch result `[]`: report that there were no new reviews, not that scraping failed

## Response style to the user

Keep the summary operational and concrete.

- State the command outcome in plain language
- Mention the business ID and review ID used
- Include the saved draft text when a draft was created
- If you had to stop, explain exactly which prerequisite or identifier was missing
