---
title: "Devlog 00002"
date: 2023-06-01T10:40:30+01:00
draft: false
pin: true
summary: "QF Research & scaling p0tion"
---

# Devlog - 06/06 - 30/06

[Researching](https://github.com/ctrlc03/qfi-kmeans) anti collusion solutions for quadratic voting and quadratic funding and scaling [p0tion](https://github.com/privacy-scaling-explorations/p0tion) using EC2. 

## QF and k-means

Quadratic funding (or quadratic voting) is prone to collusion. Users might be able to influcence the result of a round by colluding with each others and vote (or allocate funds) to certain projects to "extort" a larger amount from the matching pool. 

In order to prevent this, qf formulas include a penalization coefficient which reduce the amount of matching pool received by a project, based on the user's ballot coefficient. A common technique is called pairwise matching, where each pair of votes is checked and a coefficient associated based on the similarities between them. While effective to detect some sort of collusion, it is not very efficient to verify using a zk-SNARK circuit, and cannot detect more complex types of collusion such as second order behavior (group think or copy and paste from social media).

During these past few weeks, I have looked into how we could use a simple clustering algorithm, k-means, to detect collusion in qf/qv.

### k-means basics

k-means is a simple clustering algorithm that works as follow:

1. select random k datapoints as initial centroids -> these will be the initial clusters centers
2. for each point in the dataset, calculate the distance from each centeroid (k-means usually uses eucledian distance). Assign these points to the cluster with the nearest centeroid 
3. the centeroids will change based on the mean of the points assigned to the cluster 
4. with the updated centeroids we now calculate the distance of the points to each centeroid again 
5. repeat the above two steps until a max number of iterations or convergence is reached (Convergence is typically determined by checking if the centroids no longer move significantly between iterations or if the assignments of data points to clusters stabilize)

Note that is important to choose an appropriate k value which depends on the data that is to be analized. At this time, a formula was not chosen yet. 

### How to apply k-means to QF/QV

With the output of a round, we have an array of user ballots. Each ballot represents the votes and weight for each project. After selecting a k value and the random ballots which are to be the centroids, we can assign the other ballots to their cluster based on the distance between the centroid and the ballot, and repeat until the difference in centroids is within a certain treshold. 

After the algorithm has run, we can calculate the coefficient based on how many ballots are within each cluster. The formula is:

$1/clusterSize$

Now, we can assign the coefficient to each ballot based on its assignment in the centroid and calculate the QF as follows:

$SUM([1*s,4*r,9*t]**0.5)**2$

where s,r,t and the coefficients for each corresponding user vote. 

### How to implement a k-means algorithm in TypeScript 

> The code can be found on [GitHub](https://github.com/ctrlc03/qfi-kmeans/tree/main/src/ts)

The TS implementation includes a number of functions:

* data parsing related functions (converting JSON input to an object, adding zero votes to even out the ballot vectors) ([ref](https://github.com/ctrlc03/qfi-kmeans/blob/main/src/ts/k-means.ts#L10-L108))
* calculating the initial centroids by selecting random ballots for each cluster ([ref](https://github.com/ctrlc03/qfi-kmeans/blob/main/src/ts/k-means.ts#L116))
* calculating the distance between a centroid and a ballot ([ref](https://github.com/ctrlc03/qfi-kmeans/blob/main/src/ts/k-means.ts#L179))
* assigning ballots to clusters based on the distance between them ([ref](https://github.com/ctrlc03/qfi-kmeans/blob/main/src/ts/k-means.ts#L212))
* updating the centroids by calculating the mean of the ballots within the centroid itself ([ref](https://github.com/ctrlc03/qfi-kmeans/blob/main/src/ts/k-means.ts#L257))
* checking if clusters have converged ([ref](https://github.com/ctrlc03/qfi-kmeans/blob/main/src/ts/k-means.ts#L432))
* calculating cluster size, coefficients and assigning coefficients to users ([ref](https://github.com/ctrlc03/qfi-kmeans/blob/main/src/ts/k-means.ts#L294-L351))
* calculating the QF using the coefficients ([ref](https://github.com/ctrlc03/qfi-kmeans/blob/main/src/ts/k-means.ts#L361))

The output can be later plotted using a plotting library such as `matplotlib`.

### How to use zk-SNARKs to verify a ballot coefficient

After publishing the results of the round, users can verify that the coefficient assigned is correct by using a zk-SNARK circuit (in this case written using Circom). 

The circuit takes as input the user ballot, the centroids, and the index of the centroid to which it is assigned. Rather than computing the whole algorithm again, the circuit will calculate the distance of the ballot from each centroid, and confirm whether the resulting index matches the input index. 

**k-means**

```js 
pragma circom 2.1.0;

include "./distance.circom";

// template to verify k-means clustering
template Kmeans(k, projects) {
    // there should be at least two clusters
    assert(k > 1);
    // we should have more than one project
    assert(projects > 1);
    // projects should be more than clusters
    assert(projects > k);

    // the centroids of each cluster
    signal input centroids[k][projects];
    // the user's vote ballot
    signal input ballot[projects];
    // which cluster the ballot is supposed to be in
    signal input clusterIndex;

    // our output
    signal output match;

    var index = 0;
    // large number 2^64 = 18446744073709551616
    var previousDistance = 18446744073709551616;

    // our distance calculators
    component calculateDistance[k];

    // loop through each cluster
    for (var i = 0; i < k; i++) {
        calculateDistance[i] = DistanceCalculator(projects);
        // calculate the distance between the ballot and the centroid
        calculateDistance[i].vectors[0] <-- ballot;
        calculateDistance[i].vectors[1] <-- centroids[i];
        // if the calculated distance is less than the previous distance, 
        // then store the index and the distance
        if (calculateDistance[i].sumOfSquaredDistances < previousDistance) {
            previousDistance = calculateDistance[i].sumOfSquaredDistances;
            index = i;
        } 
    }

    // constrain that the provided index is equal to the calculated index
    match <-- index;
    clusterIndex === match;
}
```

**Distance calculator**

```js
pragma circom 2.1.0;

include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/mux1.circom";

// a template that can be used to calculate the distance between two vectors
template DistanceCalculator(projects) {
	// our input is a 2D array of project votes (1 is the ballot and the other is the centroid)
	signal input vectors[2][projects];
	// the output is the sum of the square distances
	signal output sumOfSquaredDistances;

	// we use this signal to hold the intermediate sum
	signal accumulator[projects + 1];
	// hold both vectors[0][i] - vectors[1][i] and vectors[1][i] - vectors[0][i]
	signal differences1[projects];
	signal differences2[projects];
	// hold the squared differences
	signal squaredDifferences[projects];

	// Initialize the accumulator to 0
	accumulator[0] <== 0;

	// we use these to compare the number of projects
	component lessThan[projects];
	component mutexesLess[projects];
	
	// Compute the sum of squared differences
	for (var i = 0; i < projects; i++) {
		// need to ensure that the result is always non negative 
		// (in this case it would wrap around and be larger e.g 3 - 5 != -2 -> largestNumber - 2)
		// we use 32 bits to represent up to 2^32 vote weight 
		// (but could use 16 as that would be 65535)
		lessThan[i] = LessThan(32);
		lessThan[i].in[0] <== vectors[0][i];
		lessThan[i].in[1] <== vectors[1][i];

		// calculate the difference between the two vectors
		differences1[i] <== vectors[0][i] - vectors[1][i];
		differences2[i] <== vectors[1][i] - vectors[0][i];

		// confirm the output of LessThan
		mutexesLess[i] = Mux1();
		mutexesLess[i].c[0] <== differences1[i];
		mutexesLess[i].c[1] <== differences2[i];
		mutexesLess[i].s <== lessThan[i].out;

		// if [0][i] < [1][i] -> output is 1 -> thus we want differences2[i] 
		// which is [1][i] - [0][i]
		// if [0][i] >= [1][i] -> output is 0 -> thus we want differences1[i]
		// which is [0][i] - [1][i]
		squaredDifferences[i] <== mutexesLess[i].out * mutexesLess[i].out;
		// add to the accumulator
		accumulator[i + 1] <== accumulator[i] + squaredDifferences[i];
	}

	// Output the final sum is the value held in the last index 
	sumOfSquaredDistances <== accumulator[projects];
}
```

### Interesting fact about circom

> Thanks to ChatGPT for the explaination btw.

Initially I was using the prime value p as the initialIndex variable, thinking this would be the largest value that could be represented in Circom, and thus avoid any error with the calculation of the shortest distance. However, when comparing the distance between a ballot and a centroid with this number, the result was always that the distance was larger than the p number. In Circom this large prime number is `21888242871839275222246405745257275088548364400416034343698204186575808495617`. 

When computing: `if (distance < 21888242871839275222246405745257275088548364400416034343698204186575808495617)` Circom would perform the operation in the finite field modulo `p`. This results in a different behaviour compared to regular integer arithmetic. Due to wrapping behaviour, large values close to `p` would be seen as small positive values, hence why Circom returning that `21888242871839275222246405745257275088548364400416034343698204186575808495617` was smaller than the calculated distance. 

Therefore, I took an arbitrarly large number such as 2^64 as the initial minimum distance.


### Optimizing the circuit

In circom, optimization means reducing the number of constraints - the result is less computational costs and quicker proving time. This can be achieved by reducing the number of intermediate signals. In our case, we can reduce the number of signals by reducing the amount of operations. The distance algorithm used in the original algorithm is the eucledian distance, thus for each vote in the ballot, we calculate the distance from the centroid by subtracting one point (weight) from the other and squaring the result. After, we sum all distances and calculate the square root.

Let's look at the following example

```ts 
ballot = [4, 3]
centroid = [[5, 7], [2, 1]]
```

**Eucledian distance formula**

$sqrt(sum[(b2-b1)^2, (c2-c1)^2), ..])$

* Ballot 1 Centroid 1 distance 

$sqrt(sum[(5-4)^2, (7-3)^2)]) = sqrt(sum[(1)^2, (4)^2]) = sqrt(sum[1, 16]) = sqrt(17)$

* Ballot 1 Centroid 2 distance 

$sqrt(sum[(2-4)^2, (1-3)^2]) = sqrt(sum[(-2)^2, (-2)^2]) = sqrt(sum[4, 4]) = sqrt(8)$

Ballot 1 is closer to Centroid 2 as sqrt(8) < sqrt(17)

Due to the format of our data, we can simplify this in our circuits even more:

1. do not calculate the square root: 

**Formula**

$sum[(b2-b1)^2, (c2-c1)^2), ..]$

* Ballot 1 Centroid 1 distance 

$sum[(5-4)^2, (7-3)^2)] = sum[(1)^2, (4)^2] = sum[1, 16] = 17$

* Ballot 1 Centroid 2 distance 

$sum[(2-4)^2, (1-3)^2] = sum[(-2)^2, (-2)^2] = sum[4, 4] = 8$

Ballot 1 closer to centroid 2 as 8 < 17

Now we can even remove the square of the differences and just ensure that we take the absolute value (manhattan distance) (in circom we subtract the lowest from the largest)

**Formula**

$sum[abs(b2-b1), abs(c2-c1), ..]$

* Ballot 1 Centroid 1 distance

$sum[abs(5-4), abs(7-3)] = sum[1, 4] = 5$

* Ballot 1 Centroid 2 distance

* $sum[abs(2-4), abs(1-3)] = sum[2, 2] = 4$

Ballot 1 closer to centroid 2 as 4 < 5

Let's implement this in circom

**k-means**

```js 
pragma circom 2.1.0;

include "./distance_manhattan.circom";

// template to verify k-means clustering
template KmeansManhattan(k, projects) {
    // there should be at least two clusters
    assert(k > 1);
    // we should have more than one project
    assert(projects > 1);
    // projects should be more than clusters
    assert(projects > k);

    // the centroids of each cluster
    signal input centroids[k][projects];
    // the user's vote ballot
    signal input ballot[projects];
    // which cluster the ballot is supposed to be in
    signal input clusterIndex;

    // our output
    signal output match;

    var index = 0;
    // large number 2^64 = 18446744073709551616
    var previousDistance = 18446744073709551616;

    // our distance calculators
    component calculateDistance[k];

    // loop through each cluster
    for (var i = 0; i < k; i++) {
        calculateDistance[i] = DistanceCalculatorManhattan(projects);
        // calculate the distance between the ballot and the centroid
        calculateDistance[i].vectors[0] <-- ballot;
        calculateDistance[i].vectors[1] <-- centroids[i];
        // if the calculated distance is less than the previous distance, 
        // then store the index and the distance
        if (calculateDistance[i].sumOfDistances < previousDistance) {
            previousDistance = calculateDistance[i].sumOfDistances;
            index = i;
        }
    }

    // constrain that the provided index is equal to the calculated index
    match <-- index;
    clusterIndex === match;
}
```

**DistanceCalculatorManhattan** 

```js
pragma circom 2.1.0;

include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/mux1.circom";

// a template that can be used to calculate the distance between two vectors
template DistanceCalculatorManhattan(projects) {
	// our input is a 2D array of project votes (1 is the ballot and the other is the centroid)
	signal input vectors[2][projects];
	// the output is the sum of the distances
	signal output sumOfDistances;

	// we use this signal to hold the intermediate sum
	signal accumulator[projects + 1];
	// hold both vectors[0][i] - vectors[1][i] and vectors[1][i] - vectors[0][i]
	signal differences1[projects];
	signal differences2[projects];

	// Initialize the accumulator to 0
	accumulator[0] <== 0;

	// we use these to compare the number of projects
	component lessThan[projects];
	component mutexesLess[projects];
	
	// Compute the sum of squared differences
	for (var i = 0; i < projects; i++) {
		// need to ensure that the result is always non negative 
		// (in this case it would wrap around and be larger e.g 3 - 5 != -2 -> largestNumber - 2)
		// we use 32 bits to represent up to 2^32 vote weight 
		// (but could use 16 as that would be 65535)
		lessThan[i] = LessThan(32);
		lessThan[i].in[0] <== vectors[0][i];
		lessThan[i].in[1] <== vectors[1][i];

		// calculate the difference between the two vectors
		differences1[i] <== vectors[0][i] - vectors[1][i];
		differences2[i] <== vectors[1][i] - vectors[0][i];

		// confirm the output of LessThan
		mutexesLess[i] = Mux1();
		mutexesLess[i].c[0] <== differences1[i];
		mutexesLess[i].c[1] <== differences2[i];
		mutexesLess[i].s <== lessThan[i].out;

		// if [0][i] < [1][i] -> output is 1 -> thus we want differences2[i] 
		// which is [1][i] - [0][i]
		// if [0][i] >= [1][i] -> output is 0 -> thus we want differences1[i]
		// which is [0][i] - [1][i]

		// add to the accumulator
		accumulator[i + 1] <== accumulator[i] + mutexesLess[i].out;
	}

	// Output the final sum is the value held in the last index 
	sumOfDistances <== accumulator[projects];
}
```

We can now calculate the number of constraints based on the same parameter set:

k = 5 and projects = 125

* circuit1:

```bash 
circom --r1cs tests/circuits/k-means_test.circom
template instances: 6
non-linear constraints: 21875
linear constraints: 0
public inputs: 0
public outputs: 1
private inputs: 751
private outputs: 0
wires: 22502
labels: 32638
```

* circuit2:

```bash 
circom --r1cs tests/circuits/k-means_manhattan_test.circom
template instances: 6
non-linear constraints: 21250
linear constraints: 0
public inputs: 0
public outputs: 1
private inputs: 751
private outputs: 0
wires: 21877
labels: 32013
```

We can see that we have removed the number of constraints by 625 (21875-21250). This is k*projects (5*125). So for each project we add, we end up having k less constraints, or on the other hand, if we change k by 1, we end up having 125 (projects) constrains less.

Looking at the code, we removed the `squaredDifferences` signal which results in this optimization. 

## Scaling p0tion 

One of the current limitations of p0tion is that due to the specs of the Cloud Functions, which can run with up to 16gb ram, it was never possible to verify a contribution for a circuit with large parameter sizes. 

To solve this, we integrated the following AWS services:

* EC2 - to run and manage VMs
* SSM - to execute commands remotely on the VM

When creating a ceremony, there can be one or more circuits, which can vary in constraints. For instance one circuit might not require much computing power to contribute to a zKey or to verify it, whereas another might require a very large amount of resources. With this new update, a coordinator can select a different type of VM for each circuit, which will be span up during the ceremony creation. Let's say that we need a VM with 64gb ram and one with 16gb, now the coordinator will be able to select between a variety of options and a VM matching such resources will be created. To make the process even more efficient, during creation, each VM will download the required files by copying the powers of tau and genesis zKey to disk:

```ts 
 const command = [
        "#!/bin/bash",
        "sudo yum update -y",
        "sudo yum install -y nodejs",
        "npm install -g snarkjs",
        `aws s3 cp s3://${zKeyPath} /var/tmp/genesisZkey.zkey`,
        `aws s3 cp s3://${ptauPath} /var/tmp/pot.ptau`
]
```

The contribution steps have not changed, however, the `verifyContribution` cloud function will now pass the execution to the VM associated with the circuit for whose zKey we are verifying. 

In a nutshell the function does the following:

1. perform checks to ensure that the user calling the function is authorized to do so
2. fetch the required circuit and ceremony data
3. start the VM associated with the circuit
4. wait till the VM is up and running
5. use SSM to execute the following commands on the VM:
   ```ts 
    `aws s3 cp s3://${bucketName}/${lastZkeyStoragePath} /var/tmp/lastZKey.zkey`,
    `snarkjs zkvi /var/tmp/genesisZkey.zkey /var/tmp/pot.ptau /var/tmp/lastZKey.zkey | tee /var/tmp/verification_transcript.log`,
    `aws s3 cp /var/tmp/verification_transcript.log s3://${bucketName}/${verificationTranscriptStoragePathAndFilename}`,
    `rm /var/tmp/lastZKey.zkey /var/tmp/verification_transcript.log`
   ```
   * download the last zKey 
   * verify using snarkjs 
   * upload the transcript to s3
   * cleanup 
6. retrieve the output of the command using SSM
7. if the `ZKey Ok!` string is in the output, then the zKey was valid, otherwise no
8. stop the VM
9. continue with storing the data to firebase 

### Let's talk DevOps 

In order to use AWS VMs to verify a contribution we need to setup the correct IAM roles/permissions. We also want to follow the principle of least privilege and ensure that other resources in the AWS account are not at risk due to these new permissions. 

Therefore, I divided the policies into a general policy for the IAM user spinning up S3 buckets and EC2 instances, and 2 special policies for privileged functions on both S3 and EC2 - each with a condition of the Name tag of the resource to equal a particular string. Unfortunately it is not possible to use a resource based condition on the bucket tag itself, only the objects. However, this works fine for EC2 instances. Surely terminating an instance is much more dangerous, and for other buckets we can set an inline policy to prevent deletion by anyone but the bucket owner. 

**General policy**

```json 
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "S3andEC2andSSM",
            "Effect": "Allow",
            "Action": [
                "s3:CreateBucket",
                "s3:ListBucket",
                "s3:ListMultipartUploadParts",
                "s3:GetObject",
                "s3:AbortMultipartUpload",
                "s3:GetObjectVersion",
                "s3:GetBucketTagging",
                "ec2:RunInstances",
                "ec2:DescribeInstanceStatus",
                "iam:PassRole"
            ],
            "Resource": "*"
        }
    ]
}
```

**S3 privileged access**

```json 
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "S3Privileged",
            "Effect": "Allow",
            "Action": [
                "s3:DeleteObject",
                "s3:DeleteBucket",
                "s3:PutBucketPublicAccessBlock",
                "s3:PutBucketCORS",
                "s3:PutBucketObjectLockConfiguration",
                "s3:PutBucketAcl",
                "s3:PutBucketVersioning",
                "s3:PutObject",
                "s3:PutObjectAcl",
                "s3:PutBucketOwnershipControls"
            ],
            "Resource": "*"
        }
    ]
}
```

**EC2 and SSM privileged access**

```json 
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "EC2Privileged",
            "Effect": "Allow",
            "Action": [
                "ec2:StopInstances",
                "ec2:TerminateInstances",
                "ec2:StartInstances",
                "ssm:SendCommand",
                "ssm:GetCommandInvocation"
            ],
            "Resource": "*",
            "Condition": {
                "StringEquals": {
                    "aws:ResourceTag/Name": "p0tionec2instance"
                }
            }
        }
    ]
}
```



To sum up:

* s3 - create and manage buckets + object permissions
* ec2 - start, stop, terminate and describe instances
* ssm - run a command and retrieve the output
* iam - pass down a role (the IAM user will need to attach a instance policy to the ec2 instance)

On the other hand, the EC2 instances will require the following instance policy:

```json 
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "EC2InstanceRole",
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket",
                "s3:PutObject",
                "s3:GetObject",
                "s3:PutObjectAcl",
                "ssm:UpdateInstanceInformation",
                "ssmmessages:CreateControlChannel",
                "ssmmessages:CreateDataChannel",
                "ssmmessages:OpenControlChannel",
                "ssmmessages:OpenDataChannel"
            ],
            "Resource": "*"
        }
    ]
}
```

In a nutshell:

* s3 - list the objects in the bucket, download them and upload new ones with custom ACL
* ssm - allow commands to be run and output to be posted

### Is this secure?

Thanks to IAM roles and policies, we can safely execute commands on a VM using SSM, and only the IAM user used by the cloud functions can run commands and retrieve output. We initially thought or running an API in the VM, however this would have needed to be secured using some sort of authentication (perhaps JWT); with SSM we do not have to worry about that. 

### Is this more expensive?

We have not run benchmarks yet, however the costs of running VMs can be quite cheap, considering that AWS charges for usage of a VM with increments of 60 seconds. Thus if the VM is running for 5 minutes to verify the contribution, we only end up paying 5 minutes of computing power (a 72gb VM can cost up to 3$ per hour depending on the number of VCPUs). 

The only other new cost is storage, as each VM requires a separate hard drive to store the ceremony files such as powers of tau and genesis zKey. AWS free tier comes with 30gb a month of elastic block service (EBS), so for smaller ceremonies a user might not incur into any fees. 