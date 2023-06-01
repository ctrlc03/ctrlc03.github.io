---
title: "Devlog 00001"
date: 2023-06-01T10:40:30+01:00
draft: false
pin: true
summary: "How to frontend"
---

# Devlog 23/05 - 06/06

How the MACI v1 ceremony [website](https://mpc-tool-ctrlc03.web.app/) was built. Link to the [repo](https://github.com/privacy-scaling-explorations/maci-phase2-setup).

## How to frontend

In three simple steps:

Step 1. Get a good designer, it's incredible how a good design makes everything easier for a dev. 
Step 2. Figma has many plugins which can be used to port the design to some sort of React code/CSS. We decided to use [FigPilot](https://figma.chakra-ui.com/) which generates a somewhat working React code using Chakra UI. 
Step 3. Modify the code to be more responsive (the output from FigPilot uses fixed measures such as pixels rather than percentages) and add colors and images.

## Highlights

### Vercel <> Firestore != friends

For some reason, we could not get the app deployed on Vercel to talk to Firestore. Stack overflow did not help, so we ended up deploying it using Firebase hosting. 

This works out pretty well and it's super easy:

* `npm install -g firebase-tools`
* `npx firebase init`
* `npx firebase deploy --only hosting`

Now, every time we want to deploy we can just use `npx firebase deploy --only hosting` and the app will update in no time. 

For the CI, we can use the following workflow to automatically deploy on new commits to dev and main:

```yml
name: Deploy to Firebase - deploy prod on push

on:
  push:
    branches: [main, dev]

jobs:
  build_and_deploy_prod:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install deps and deploy
        run: |
          echo "${{ secrets.ENV_FILE }}" > ./.env
          yarn install
          yarn build

      - name: Write serviceAccountKey in a JSON file
        uses: jsdaniell/create-json@v1.2.1
        with:
          name: "serviceAccountKey.json"
          json: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}

      - name: Deploy
        run: yarn deploy
        env:
          GOOGLE_APPLICATION_CREDENTIALS: ./serviceAccountKey.json
```

To sum it up:

1.  save the secrets in a .env file
2. install dependencies and build the project
3. save the service account key needed to deploy to Firebase
4. deploy using a yarn script (firebase deploy --only hosting)


### No need for a table pagination library

In order to display the verification transcripts for the ceremony, which hopefully will be in the thousands, they were organized as a table. Of course, one cannot show all of them at once so I had to come up with a solution to display x transcripts at one time, and filter them by circuit and allow to search. How do we do this all in one?

```ts
transcripts
    .filter(checkByCircuit)
    .filter(checkSearch)
    .slice(startIndex, endIndex)
    .map((transcript: ITranscript, index: number) => {})
```

`transcripts` is an array of our Transcript object (basically it contains the transcript content, the circuit name, the zkey index and participant id), and we want to:

* filter by circuit name -> `.filter(checkByCircuit)`

```ts
const checkByCircuit = (transcript: ITranscript): boolean => {
    if (selectedCircuit === '') return true
    return transcript.circuitName === selectedCircuit
}
```

* filter by search term -> `.filter(checkSearch)`

```ts
const checkSearch = (transcript: ITranscript): boolean => {
    if (searchTerm === '') return true
    // if it's alphanumerical it's the zkey index
    if (searchTerm.match(/^[0-9]+$/)) {
        return transcript.zKeyIndex.includes(searchTerm)
    }
    // otherwise is the participant index
    return transcript.contributorId.includes(searchTerm)
}
```

* only show 50 at a time `.slice(startIndex, endIndex)`

```ts
const paginate = (index: number) => {
    if (index === 1) {
        setStartIndex(0)
        setEndIndex(itemsPerPage)
    } else {
        setEndIndex(index * itemsPerPage)
        setStartIndex(index * itemsPerPage - itemsPerPage)
    }
}
```

When the user clicks on the table to navigate to the next page, the new page index will be passed to the `paginate` function and set the start index and end index so that the array of transcripts can be sliced accordingly.