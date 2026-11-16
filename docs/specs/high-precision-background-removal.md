# High-precision background removal, self-hosted

Status: proposal. No code in this note. Not approved.

The phone already removes the background with a model that runs in the browser. That is good enough for a first try, and it keeps the photo on the device. It is not good enough for the backgrounds we actually see: posters, frames, club banners, and furniture, with fine grey-brown hair in front of them. This note asks whether a stronger model, running only on our own server, is worth adding.

A plain wall is not the normal case at home or at a training venue. We will not treat "works on a plain wall" as the test that decides this.

## What would stay the same

- The person still lines the head up with the oval on the phone. That oval does not change.
- Save still resizes the picture once, into the print frame. The printed card does not change.
- If the server cannot answer, the phone falls back to today's browser removal (the portrait model). The photo can still be saved.
- No paid removal service, and no upload to a company we do not control.

## What would be added

1. The phone sends the original photo to the app we already run, over the same signed-in connection used for everything else.
2. Our server builds a mask: which pixels are the person, including the soft edge of the hair.
3. The server sends that mask back. The phone still places the person and, on Save, still does the one resize.

The person waits on the order of several seconds, sometimes longer. The page should say that it is working, and offer the current phone tool if the wait fails.

## Models worth comparing

We only want models we can run ourselves, with a licence that allows a club and federation app. Weights and code must both be checked. "Open" is not the same as "we may use this in production".

| Model | Licence for our app | Fine hair and clutter | Size on disk | Needs a graphics card? |
| --- | --- | --- | --- | --- |
| BiRefNet, including the portrait, matting, and "dynamic" variants | MIT. Use in a club app is allowed. Keep the copyright notice with the file. | The strongest candidate. Published results are aimed at high-resolution cutouts and hair. The portrait and matting variants are the ones to try first on people. The dynamic variant accepts a range of photo sizes. | About 0.2 billion numbers. Weight files are roughly 170 MB (small/"lite") to about 400–900 MB (full). | A graphics card makes it fast. It also runs on the processor alone. |
| BiRefNet lite | Same MIT licence. | Likely a bit less precise than the full model. The one to try if the server does not have enough memory. | About 44 million numbers. Weight file around 170 MB. | Same as above, but lighter. |
| BEN2 base | MIT for the published base model. The fuller BEN2 is only offered as someone else's website or API. We would not call that API. | The authors emphasise hair. Only the base model is ours to run. | About 95 million numbers. Weight file about 360 MB. | Graphics card or processor. |
| The portrait model already in the phone (MODNet) | Apache-2.0. Already allowed, and already in use. | Weak on posters and on sparse hair. Stays as the fallback, not as the upgrade. | About 25 MB, already downloaded by the phone. | Runs in the browser, on the phone's processor. |
| The usual phone tool (ISNet, inside the removal library we ship) | Already in the app as the fallback behind the portrait model. | Same limit: real rooms confuse it. | Already shipped in the browser. | Browser. |
| BRIA RMBG-1.4 and RMBG-2.0 | Not for us without a paid contract. RMBG-2.0 is Creative Commons BY-NC (non-commercial). RMBG-1.4 is also limited to non-commercial evaluation unless BRIA sells a commercial licence. | Quality is well regarded. The licence rules them out for this app unless we later pay and sign their terms. | Do not download them for production. | Not our problem until the licence is solved. |

First comparison, if this is approved: BiRefNet portrait or BiRefNet matting, and BiRefNet lite if memory is tight. BEN2 base is the second opinion. RMBG stays off the list unless a commercial licence is bought on purpose.

## Our server

The app on Coolify runs the website, the database, the queue, and the background jobs on one machine. The setup file does not give that machine a graphics card. This note could not read the live machine's processor or memory. Treat the numbers below as a planning assumption, and measure on the real machine before building.

Assumption: a small rented server, processor only, shared with the rest of the app, on the order of a few processor cores and 8–16 GB of memory. If the real machine is smaller, the full model may not fit beside the database and the website.

Published timings, not our machine:

- Full BiRefNet, about 1024 pixels on a side, on a processor: about 4 seconds on a fast laptop chip (Apple M1 Max), about 6 seconds in one user's test, and about 7–19 seconds on desktop Intel chips in a public benchmark. A small rented server can be slower than those.
- The same model on a recent graphics card (the author's RTX 4090): about 17 pictures a second. We do not have that card.
- Memory while it runs: the weight file plus working space. Plan on a few gigabytes for the full model, less for the lite model. Four website workers must not each load their own copy.

So a photo is not instant. It is a short wait, then a mask. That is acceptable for one portrait. It is not a live video effect.

## Where the model should run

Not inside the website workers. Those workers answer every other request. Loading a large model in each of them (the default is 4) would multiply the memory use and make the whole site slow while a photo is processed.

Not as the only job on the existing background worker either, if we can avoid it. That worker also sends mail and runs billing. A long photo job, or a crash inside the model, would delay those.

Best fit: one small extra container on our machine, whose only job is this mask. It loads the model once. The website hands it a photo through the queue we already use, then waits for the mask. The upload itself returns quickly. If the current machine does not have the memory, that container moves to a second machine that we still control. The photo still never goes to a third party.

## Privacy

- Photos, including photos of children, stay on our infrastructure.
- No third-party removal service and no paid API.
- The original is held in memory only long enough to build the mask, then discarded. It is not written to the media folder and not kept "just in case".
- Logs record that a removal ran, how long it took, and whether it failed. They do not record the picture, the pixels, or a thumbnail.
- The mask that comes back is the same kind of result the phone already keeps for the profile photo. Nothing new is stored beyond today's profile photo.

## Security

- Only a signed-in user can ask for a mask, on the photo API that already exists. No new address that works without a login.
- Reject pictures over a fixed size, and reject files that are not a photo.
- Limit how often one account can ask, so one phone cannot fill the server.
- Stop a job that runs too long, and fall back to the phone tool.
- The weight file is pinned by a checksum and copied when the image is built, the same way the phone's model files are pinned. The server does not fetch a new model on each photo.

## How we would judge it

No real member photos, and no photos of children from the club. Use drawings we generate, plus public pictures whose licence allows a private test. Do not commit those pictures if the licence is unclear.

Look at cases that match real rooms, not a studio wall:

- Fine, sparse, spiky hair with the wall showing between the strands.
- A colourful poster, frame, or banner touching the hair.
- More than one object behind the person.

Pass means the hair tips stay, including the soft edge, and the poster does not stay glued to the head. Fail means the face is eaten, the hair is chopped into blocks, or a decoration is kept as part of the person. A plain wall is not on the score sheet.

Try the flag with staff accounts first. Members do not see it until that trial looks right.

## Cost and risk

- No fee per photo if we stay with MIT weights.
- The cost is memory and processor time on the server, and the time to judge the pictures.
- Risk: the model is slow enough that people give up; the machine runs out of memory; a cluttered background is still wrong; we pick a licence that does not allow this app. The fallback to the phone tool limits the outage risk.
- A graphics card would make it much faster. It is not required to find out whether the quality is good enough.

## Suggested order, if this is approved

1. Measure memory and a single photo on the real Coolify machine, with BiRefNet lite and with one full BiRefNet portrait or matting weight. Write down the seconds and the memory. Do not deploy it to members.
2. Judge those masks on the pictures in the section above.
3. Only then add the queue, the flag, and the phone fallback.
