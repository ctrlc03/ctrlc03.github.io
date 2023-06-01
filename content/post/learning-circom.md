---
title: "Learning Circom"
date: 2023-04-28T10:40:30+01:00
draft: false
pin: true
summary: Learning Circom together
---

# Circom 101 

> In progress

Trying to learn Circom by going through the basic circuits (that come with [circomlib](https://github.com/iden3/circomlib)).

## Concepts

### Signals 

Signals in Circom are immutable (thus the opposite of a variable), and their content is unknown at compile time even if a constant is assigned to it. All input signals are private by default, and public signals can only be distinguished when defining the main component.

Let's take as an example the following simple circuit:

```js
pragma circom 2.0.x;

template Main() {
  signal input x1;
  signal input x2;
  signal input x3;
  signal input x4;

  signal y1;
  signal y2;

  signal output out;

  y1 <-- x1 + x2;
  y2 <-- y1 / x3;
  out <-- y2 - x4;

  y1 === x1 + x2;
  y1 === y2 * x3;
  out === y2 - x4;
}

component main { public [ x2 ] } = Main();
```

We can see that we declare `x2` as a public input signal at very end of the circuit, when declaring the `main` component.

Output signals on the other end, are always public and cannot be made private.

Syntax: `signal x;`

Can use the keywords `input`, and `output`. When neither of these keywords are used, the signal is considered an intermediate circuit.

### Variables 

Variables are used to assist in computations where no constraint is needed. 

Syntax: `var x;`

### Assignments and constraints

There are different ways of assigning signals (the direction of the arrow depends on the position of the signal):

* `<--` - assign but no constraint is generated (dangerous)
* `<==` - assign and generate a constraint
* `-->` - assign but no constraint is generated (dangerous)
* `==>` - assign and generate a constraint

## Templates

### IsZero

This simple circuit allows to check whether a value is equal to zero or not.

```js 
pragma circom 2.0.0;

template IsZero() {
    // write a template that returns true if the input is zero
    signal input in;
    signal output out;

    // the inverse of the signal 
    signal inv; 
    // if the input is zero, then the inverse is zero
    // otherwise, the inverse is 1 / input
    inv <-- in != 0 ? 1 / in : 0;

    // out is -input * inverse of in + 1
    out <== -in * inv + 1;

    // constraint that out is opposite of in 
    in * out === 0;
}
```

### Bits2Num 

Template to covert an array of bits to its decimal representation:

```js 
template Bits2Num(n) {
    // array of bits to convert
    signal input in[n];
    // signal to hold the result
    signal output out;
    // tmp variable to store the result
    var lc1=0;

    // the exponent
    var e2 = 1;
    // loop for however many bits we have
    for (var i = 0; i<n; i++) {
        // add to the tmp var the curent bit * exponent
        lc1 += in[i] * e2;
        // increase the exponent
        e2 = e2 + e2;
    }

    // assign and constrain the result to the output
    lc1 ==> out;
}
```


### Mux1

```js

template MultiMux1(n) {
    // multi dimensional array of n and 2 elements
    signal input c[n][2];  // Constants
    signal input s;   // Selector
    // output 
    signal output out[n];

    // loop through each element
    for (var i=0; i<n; i++) {
        // 2nd - 1st * selector + 1st
        out[i] <== (c[i][1] - c[i][0])*s + c[i][0];
    }
}

template Mux1() {
    // tmp var (could be directly added inside the loop)
    var i;
    signal input c[2];  // Constants
    signal input s;   // Selector
    signal output out;

    component mux = MultiMux1(1);

    for (i=0; i<2; i++) {
        mux.c[0][i] <== c[i];
    }

    s ==> mux.s;

    mux.out[0] ==> out;
}
```