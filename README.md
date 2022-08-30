
<script type="text/javascript" async
  src="https://cdn.mathjax.org/mathjax/latest/MathJax.js?config=TeX-MML-AM_CHTML">
</script>

# Cairo and StarkNet Security

## Introduction 

[StarkNet](https://starkware.co/starknet/) is a decentralized ZK rollup which operates as a Layer 2 (L2) for Ethereum. 
Smart contracts are developed using the Cairo programming language, a general purpose Turing-complete language. 

While Cairo is still relatively new, it is progressing at a very quick pace and being widely adopted by many developers. With it being this new, security is still a big variable, and research on this field is still in its infancy. Therefore, this "guide" aims to provide some points to consider when writing smart contracts with Cairo.

> Note: If you don't see a link when we are referencing a library, tool etc. you will find them at the bottom of the page.

For easy navigation here's a table of contents:

* TOC
{:toc}

## Cairo and Security 

Although it can be argued that smart contracts are vulnerable to a common set of attack vectors, the idiosyncrasies of a given language can lead to unique edge cases. Furthermore, there are risks which arise from the use of a less "battle-tested" programming language such as Cairo, where the fast paced nature of the project can lead to libraries and standards being constantly updated.

While these standards are constantly updated and new libraries are introduced pretty much every day, it is still recommended to use popular libraries such as OpenZeppelin's (OZ) Cairo contracts ([available here](https://github.com/OpenZeppelin/cairo-contracts "openzeppelin github")), as re-inventing the wheel is inefficient and can result in the addition of obscure bugs within the code. Having said this, please apply caution when integrating any library in your code, and always make sure that you fully understand how they work. 

Below are presented different topics and guidelines designed to assist with development of secure Cairo code, intended to be used by both developers and auditors performing smart contract audits. Please note that this document will remain in active development and will change as features are added/removed and new attack vectors are identified. Furthermore, there are still certain areas where more research is needed. 

It should be noted that some of these scenarios below have a direct correlation to bugs that the writers observed in Solidity smart contracts and may be somewhat opinionated. Also, they are presented in no specific order.

## Cairo Basics 

Cairo is built around a unique data type - the field element or `felt` (A`felt` is analogous to a integer). With this type, you can do pretty much anything you want in StarkNet. For instance, `Uint256` which Solidity devs love, are composed of:

* `low` - 128 bits
* `high` - 128 bits 

You would usually go and define a `Uint256` like this:

`let five_uint256: Uint256 = Uint256(5, 0)`

Going back to `felt`, the range can be described using this formula, if we consider the [signed range](https://www.cairo-lang.org/docs/hello_cairo/intro.html#the-primitive-type-field-element-felt):

$$-P/2 < x < P/2$$ 

Or the following, if we consider the [unsigned range](https://www.cairo-lang.org/docs/how_cairo_works/builtins.html#range-checks):

$$ 0 <= x < P $$

Where P is a very large prime number of `2^251 + 17 * 2^192 + 1` bits (note that the range check linked for the unsigned range will work on the field `[0, 2 ** 128)`). Doing a deep dive into the math here is somewhat out of the scope of this document, so please refer to [Cairo's documentation](https://www.cairo-lang.org/docs/hello_cairo/intro.html).

With Cairo, being constrained to a single data type, certain things like for instance dealing with strings, becomes difficult. Even though many developers have written awesome libraries which make everyone's life easier (a comprehensive list of third-party libraries can be found in [Cairo's Goldmine's repository](https://github.com/beautyisourbusiness/cairo-goldmine)) this can of course lead to buggy code and security risks. For instance we can deal with strings with [caistring](https://github.com/topology-gg/caistring), and perform complex math operations with libraries such as [cairo-math-64x61](https://github.com/influenceth/cairo-math-64x61).

One thing we always found interesting, is that there are no for loops in Cairo. One has to use recursion to, for instance, be able to loop through an array. The Cairo-101 [repository](https://github.com/starknet-edu/starknet-cairo-101) has some nice examples on how you can use recursion to calculate the sum of an array's elements.

What about some more lower level details on how Cairo works?  

Well, the Cairo VM has three registers:

* `ap` - allocation pointer. This points to a yet-unused memory cell.
* `fp` - frame pointer. This points to the frame of the current function. This value remains the same throughout the scope of a function.
* `pc` - program counter. Points to the current instruction.

To better understand how Cairo works and how to write StarkNet smart contracts, please refer to the official documentation and [tutorials](https://www.cairo-lang.org/docs/index.html).

Having said all of the above, let's jump into the security considerations that you all came here for, we have broken these down into key bug classes and design concepts below. 

## Access Control

With every system, access control can be problematic if not implemented correctly. Always remember to  comply with the principle of least privilege, avoiding over assigning permissions to any account as this could be very dangerous. If one account is compromised, the whole smart contract could be taken over as well as the funds stored within. 

### Role-based Access Control (RBAC)

OpenZeppelin was kind enough to develop different libraries which can be used to implement access control in StarkNet contracts:

* [Ownable](https://github.com/OpenZeppelin/cairo-contracts/blob/main/openzeppelin/access/ownable.cairo)
* [AccessControl](https://github.com/OpenZeppelin/cairo-contracts/blob/main/src/openzeppelin/access/accesscontrol/library.cairo)

For instance we can use this code to define owners of contracts as well as define other roles. Good access control systems would include multiple roles which adhere to the principle of least privilege.

For instance we could implement the following roles on a ERC20 contract:

* `Owner` or `Admin` - Owns the contract and can transfer ownership/assign roles to others as well as perform other management activity
* `Minter` - Can mint new tokens
* `Pauser` - Can pause the contract
* `Upgrader` - Can upgrade the contract (in case of an upgradeable contract)

Make sure that the roles implemented fit the purpose of the protocol, and have the least possible amount of privileges. Furthermore, use of multi-signature wallets where appropriate is highly encouraged.

Let's have a look on how you can prevent a non-owner user from calling a function using `ownable`.

In our code within the constructor we will pass as argument an address, which we want to set as admin:

```javascript 
@constructor
func constructor{
        syscall_ptr : felt*,
        pedersen_ptr : HashBuiltin*,
        range_check_ptr
    }(owner: felt):
    Ownable.initializer(owner)
    return ()
end
```

This code above will call the `initializer` function of the `Ownable` library:

```javascript 
func initializer{
        syscall_ptr : felt*,
        pedersen_ptr : HashBuiltin*,
        range_check_ptr
    }(owner: felt):
    _transfer_ownership(owner)
    return ()
end

func _transfer_ownership{
        syscall_ptr : felt*,
        pedersen_ptr : HashBuiltin*,
        range_check_ptr
    }(new_owner: felt):
    let (previous_owner: felt) = Ownable.owner()
    Ownable_owner.write(new_owner)
    OwnershipTransferred.emit(previous_owner, new_owner)
    return ()
end
```

We can see that `initializer` takes an `owner` argument and sets it as the owner of the contract by overwriting the `Ownable_owner` storage variable. From now on, we can protect our admin functions using `Ownable.assert_only_owner` which looks like the following:

```javascript 
func assert_only_owner{
        syscall_ptr : felt*,
        pedersen_ptr : HashBuiltin*,
        range_check_ptr
    }():
    let (owner) = Ownable.owner()
    let (caller) = get_caller_address()
    with_attr error_message("Ownable: caller is the zero address"):
        assert_not_zero(caller)
    end
    with_attr error_message("Ownable: caller is not the owner"):
        assert owner = caller
    end
    return ()
end
```

What it does is:

1. get the current owner 
2. get the caller address 
3. checks that the caller is not the address zero 
4. checks that the owner is equal to the caller 

This continues or reverts based on the result of point 3 and 4.

Furthermore, should we wish to implement more granular access control than just one single privileged role, we can use the `AccessControl` library (or extend the `ownable` one, but not recommended).

With `AccessControl`, we can set arbitrary roles, and have them verified in a similar fashion. In this case, we will set the admin role in the constructor of our contract, just after initializing the library. Now that we have an admin role, we can use it to set all other roles. Let's try and implement a minter role:

```javascript 
@external
func grantRole{
        syscall_ptr : felt*,
        pedersen_ptr : HashBuiltin*,
        range_check_ptr
    }(role: felt, user: felt):
    AccessControl.grant_role(role, user)
    return ()
end
```

And then protect our `mint` function to only allow the `minter` to call it, using a modifier which looks like the one below:

```javascript 
func assert_only_role{
        syscall_ptr : felt*,
        pedersen_ptr : HashBuiltin*,
        range_check_ptr
    }(role: felt):
    alloc_locals
    let (caller) = get_caller_address()
    let (authorized) = has_role(role, caller)
    with_attr error_message("AccessControl: caller is missing role {role}"):
        assert authorized = TRUE
    end
    return ()
end
```

And this is our code with the new added check:

```javascript 
@external
func mint{
        syscall_ptr: felt*,
        pedersen_ptr: HashBuiltin*,
        range_check_ptr
    }(to: felt, amount: Uint256):
    let (caller) = get_caller_address()
    AccessControl.assert_only_role(120299592115570, caller)
    ERC20._mint(to, amount)
    return ()
end
```

And this should fail if the caller does not have the minter role. OpenZeppelin devs have really made our lives easier, so please let's make sure to use their libraries to better protect our contracts.


#### Transfer of Ownership Patterns

For contracts managing user funds, it’s important that every situation is handled correctly. Something we've seen in abundance over many technologies are mistakes when transfering the ownership of contracts.
We have seen a number of different patterns being recommended to different clients in the past (especially contracts which hold large amount of user funds in escrow). 

The best approach in our opinion is to propose a new owner and with a separate call that requires them to accept ownership before it is transferred. This way, typos in the initial call will not cause financial damage, unless of course ownership is transferred to some random account which somehow notices that and accepts it. 

The logic would look something like this:

1. The owner proposes a new owner 
2. The proposed owner is saved in the `proposed_owner` storage variable 
3. The proposed owner calls `accept_ownership`, where the contract checks that the caller address equals to the value stored in the `proposed_owner` storage variable, and finally transfers ownership and resets the `proposed_owner`

In between point two and three, the original (and current) owner can call `cancel_request` to cancel the ownership proposal request.  

Additionally, it might be wise to keep an account owned by the contract manager as a proposed owner - so that in case we lose access to the first account, we can accept ownership with the proposed one (every little helps).

> A member of the Spectra team submitted a [PR](https://github.com/OpenZeppelin/cairo-contracts/pull/275) to the `cairo-contracts` libraries some time back. the code works and is tested, however it will not be accepted until the Solidity version is standardized and pushed on the Solidity contracts repository. 
This was ported from an audited Solidity version. If you do use it, it might require some changes due to OpenZeppelin having updated their contracts different times since the PR.  

## Storage Variables Visibility

First of all, storage variables are by default public, let's discuss this below.

When you define a storage variable, write and read functions are automatically created:

```javascript
@storage_var
fund contract_balance() -> (res : felt)
end
```

The above code creates a storage variable alongside the default getter/setter functions:

```javascript
contract_balance.read()
contract_balance.write()
```

This is a nice and simple implementation that allows the following `Python` code to easily compute the `storage_key`, allowing the retrieval of arbitrary data stored inside a `storage_var`:

```python
from starkware.starknet.public.abi import get_storage_var_address

balance_key = get_storage_var_address('balance')
print(f'Balance key: {balance_key}')
```

Please note that this should be modified if you are trying to access variables with multiple parameters (something like a mapping in Solidity):

```python
from starkware.starknet.public.abi import get_storage_var_address

user_balance_key = get_storage_var_address('balances', user_address)
print(f'Balance key: {user_balance_key}')
```

The output of that code above can be used together with the following `starknet-cli` command to retrieve a value stored on a contract's storage:

```bash
starknet get_storage_at \
    --contract_address CONTRACT_ADDRESS \
    --key $KEY_HERE
```

For many use cases this is perfectly fine, but what if you wanted to store sensitive data within the contract? For example, say you were developing a battleship style game and wanted to be fully on-chain, it would be best if your opponent couldn't see where you had deployed your ships with a simple query.

A possible solution? Hashing! (but actually we will see later that this might not even work). 

Let's take as an example this piece of code below, which allows the caller to store a variable to storage, let's assume this is some sort of a game where people record their moves on chain.


```javascript
@external 
func register_move_unsafe{
        syscall_ptr: felt*,
        pedersen_ptr: HashBuiltin*,
        range_check_ptr,
        ecdsa_ptr : SignatureBuiltin*
    } (
        move: felt 
    ):
    let (caller) = get_caller_address()
    positions.write(caller, value=move)
    return ()
end 
```

The keen eyed will notice that we are not doing any validation as to if the move is valid, but that is beside the point of this example (btw good catch, that would have been a bug for your audit report).

Now let's retrieve this value from storage using the StarkNet cli. 

```bash
nile send PK1 storage_example register_move_unsafe 10
Calling register_move_unsafe on storage_example with params: ['10']
Invoke transaction was sent.
Contract address: 0x01be5e81e5cf897169c2bddcd4e44ae679f6110752fa305ac6066ac4f502d653
Transaction hash: 0x1dabf9d875aa52b246ae1165a1d9f85baf59d929ac9c8c83c9127064d29ff38

key = get_storage_var_address('positions', hex_to_felt('0x01be5e81e5cf897169c2bddcd4e44ae679f6110752fa305ac6066ac4f502d653'))

starknet get_storage_at --contract_address 0x0595464445794021a5ccc8d5d81e43bdb5144fe4f503ecea50e876d46f15a8c3 --key 805712208377091207894844157877631743774922227963328789804295202303896319263 --feeder_gateway=http://127.0.0.1:5050

0xa -> 10
```

Let's try with the function that hashes the parameters. 

```javascript
@external
func register_move{
        syscall_ptr: felt*,
        pedersen_ptr: HashBuiltin*,
        range_check_ptr,
        ecdsa_ptr : SignatureBuiltin*
    }(
        previous_position: felt,
        new_position: felt
    ):
    alloc_locals
    let (local caller_address) = get_caller_address()
    let (previous_position_hash) = positions.read(caller_address)
    if previous_position != 0:
        # validate
        let (hashed_previous) = hash2{hash_ptr=pedersen_ptr}(previous_position, 0)
        if hashed_previous != previous_position_hash:
            with_attr error_message("This is not your previous move"):
                assert 1 = 0
            end
            tempvar pedersen_ptr = pedersen_ptr
        else:
            tempvar pedersen_ptr = pedersen_ptr
        end 
    else:
        tempvar pedersen_ptr=pedersen_ptr
    end 
    let (hashed_move) = hash2{hash_ptr=pedersen_ptr}(new_position, 0)
    positions.write(caller_address, value=hashed_move)
    return ()
end
```

```bash
nile send PK1 storage_example register_move 0 10 
Calling register_move on storage_example with params: ['0', '10']
Invoke transaction was sent.
Contract address: 0x01be5e81e5cf897169c2bddcd4e44ae679f6110752fa305ac6066ac4f502d653
Transaction hash: 0x192a72d7ae5c4ebbc9ed5cc64ea2f28e62c98d3e482f0dd707ad76e508b8238

starknet get_storage_at --contract_address 0x047122f5407b9e9a9c337efc43dfee5b34b172dd0b6482addb190449e254f549 --key 805712208377091207894844157877631743774922227963328789804295202303896319263 --feeder_gateway=http://127.0.0.1:5050
0x57434930fa943a7ba1a47125825756617c6db8fbdae8498110d6bd8fefcb8ba
```

And here, we show that the code works as expected (first time it succeeds as we pass 10, then replaying the same transaction fails):

```bash
nile send PK1 storage_example register_move 10 15 

Calling register_move on storage_example with params: ['10', '15']
Invoke transaction was sent.
Contract address: 0x01be5e81e5cf897169c2bddcd4e44ae679f6110752fa305ac6066ac4f502d653
Transaction hash: 0x67942e3ed39825c6727e20d5e568722b13ef4d7aaa573c4574b82ccd8363f55

ctrlc3@ubuntu:~/Desktop/cairo-security/contracts$ nile debug 0x67942e3ed39825c6727e20d5e568722b13ef4d7aaa573c4574b82ccd8363f55
⏳ Querying the network to check transaction status and identify contracts...
✅ Transaction status: ACCEPTED_ON_L2. No error in transaction.

ctrlc3@ubuntu:~/Desktop/cairo-security/contracts$ nile send PK1 storage_example register_move 10 15 
Calling register_move on storage_example with params: ['10', '15']
Invoke transaction was sent.
Contract address: 0x01be5e81e5cf897169c2bddcd4e44ae679f6110752fa305ac6066ac4f502d653
Transaction hash: 0x50e9d2c08407a6b0a99edd8b6a0473388496e57730a8dbcd067263f9e6d0771

ctrlc3@ubuntu:~/Desktop/cairo-security/contracts$ nile debug 0x50e9d2c08407a6b0a99edd8b6a0473388496e57730a8dbcd067263f9e6d0771
⏳ Querying the network to check transaction status and identify contracts...
🧾 Found contracts: ['0x047122f5407b9e9a9c337efc43dfee5b34b172dd0b6482addb190449e254f549:artifacts/storage_example.json']
⏳ Querying the network with identified contracts...
🧾 Error message:
[...]

Error in the called contract (0x47122f5407b9e9a9c337efc43dfee5b34b172dd0b6482addb190449e254f549):
Error message: This is not your previous move
storage_example.cairo:48:17: storage_example.cairo:48:17: Error at pc=0:200:
                assert 1 = 0
                ^**********^
An ASSERT_EQ instruction failed: 0 != 1.
Cairo traceback (most recent call last):
storage_example.cairo:31:6: (pc=0:226)
```

But, wait a second.. If you pass the plain text parameter in the function call, people can still see it.

Given a tx hash, people can see the parameters passed using this [endpoint](https://alpha4.starknet.io/feeder_gateway/get_transaction?transactionHash=) + the transaction hash they want information for, so all of this would not work. So for now, do not store anything sensitive on StarkNet, and if for some reason you have to, make sure you encrypt it first. 

> It would be nice to hear from game-devs how they are doing things here?

## Type Safety

### Uint256 checks 

As mentioned previously, `Uint256` are actually made up of two `felt` which can (well, should) contain up to 128 bits each. This means that an attacker has control of both the upper and lower portions of the `Uint256`. 

When performing validation of the contents, in say a balance update, it would be natural and efficient to only validate the relevant split of the integer. However, this opens a vector for attackers to manipulate contract logic for their own gain.

A couple of examples of these vectors in the wild are shown in this [report](https://chainsecurity.com/wp-content/uploads/2021/12/ChainSecurity_MakerDAO_StarkNet-DAI-Bridge_audit.pdf) by ChainSecurity, for the `Unlimited Approvals and the Range of Uint256` and `L2 DAI Allows Stealing` findings. 

In your code, you should verify that `Uint256` arguments are actually valid `Uint256`. For this, you can use `uint256_check` from [Cairo standard library](https://github.com/starkware-libs/cairo-lang/blob/master/src/starkware/cairo/common/uint256.cairo).

Moving to a practical example, we are borrowing the `Auction` challenge from 2022's Paradigm CTF. The goal of the challenge is to outbid the highest bid, which would require the user's account to bid all of his token balance times 2 + 1. Given that the ERC20 contract has not been modified, this would would either require to find a zero-day in the ERC20 contract or exploit a vulnerability in the auction contract.

Let's take a look at the `raise_bid` function below:

```javascript
@external
func raise_bid{syscall_ptr : felt*, pedersen_ptr : HashBuiltin*, range_check_ptr}(
    auction_id : felt, amount : Uint256
):
    alloc_locals

    only_open_auction(auction_id)
    
    let (caller) = get_caller_address()

    # Check if user has enough credit
    let (current_balance) = _balances.read(account=caller)
    let (locked_balance) = _lockedBalancesOf.read(account=caller)
    let (unlocked_balance) = uint256_sub(current_balance, locked_balance)
    let (enough_balance) = uint256_le(amount, unlocked_balance)

    assert enough_balance = 1

    # Update the user locked balanced
    let (new_balance, overflow) = uint256_add(locked_balance, amount)
    _lockedBalancesOf.write(account=caller, value=new_balance)
    assert overflow = 0

    # Update auction account balance
    let (current_balance) = _auctionBalances.read(auction_id=auction_id, account=caller)
    let (new_balance, overflow) = uint256_add(current_balance, amount)
    assert overflow = 0
    _auctionBalances.write(auction_id=auction_id, account=caller, value=new_balance)

    let (winning_bid) = _winning_bid.read(auction_id)
    let (is_new_winning_big) = uint256_lt(winning_bid, new_balance)

    if is_new_winning_big == 1:
        _winning_bid.write(auction_id=auction_id, value=new_balance)
        _current_winner.write(auction_id=auction_id, value=caller)
        tempvar syscall_ptr = syscall_ptr
        tempvar pedersen_ptr = pedersen_ptr
        tempvar range_check_ptr = range_check_ptr
    else:
        tempvar syscall_ptr = syscall_ptr
        tempvar pedersen_ptr = pedersen_ptr
        tempvar range_check_ptr = range_check_ptr
    end

    return ()
end
```

We can see that the function accepts an `auction_id` and an `amount` parameters. The `auction_id` is verified to be of a running auction, and will revert if not. The function that deals with validating the auction is safe, so we are going to be focusing on the only other parameter we can play with, the `amount`.

After verifying that we are trying to interact with an open auction, the contract will then pull the stored balance of the user (which can be increased by depositing tokens via the `increase_credit` function) as well as the locked balance (locked being the balance that one user added as bid). It will then calculate the unlocked balance which is equal to the `balance - locked balance`. In this case, it will be zero as we have not deposited any tokens in the contract. After, it will compare the passed `amount` value with the unlocked balance using `uint256_le`. 

If we pass a "malformed" `Uint256` to the contract, this check will pass and will let us become the highest bidder without having to deposit any tokens. 

The `Uint256` which can be passed to the contract is the following: 

```json
{"high": 0, "low":2 ** 128 + 1}
```

If you remember from the first sections, a `Uint256` is made of two felt of up to 128 bits:

* `low`
* `high`

However, a `felt` can contain more than 128 bits, therefore we can use this to bypass the check, more specifically because there are no checks in place to prevent us from passing a non valid `Uint256` value. 

Let's have a look at a more simple example where we can actually see what's going on:

```javascript 
@view 
func uint256_test{
    syscall_ptr : felt*, 
    pedersen_ptr : HashBuiltin*, 
    range_check_ptr
    } (num: Uint256) -> (res: felt):
    let zero: Uint256 = Uint256(0, 0)
    let (check) = uint256_le(num, zero)
    return (check) 
end 
```

This function simply accepts one `Uint256` value and compares it with zero to check if it's less or equal. Now, we pass the `Uint256` representation of one (`1 0`):

```bash
starknet call --address 0x018bbff3ce2473f7e779fbc2442cc5f0a5617789250862cba0512e2df304f70b --abi artifacts/abis/contract.json --function uint256_test --inputs 1 0 --no_wallet --feeder_gateway=http://127.0.0.1:5050
0
```

`uint256_is_le` returns zero which means that 1 is not less or equal to 0 (sanity check here). 

No we try with a "malformed" `Uint256` which is the next digit up of what an `Uint256` low or high should contain:

```bash 
starknet call --address 0x018bbff3ce2473f7e779fbc2442cc5f0a5617789250862cba0512e2df304f70b --abi artifacts/abis/contract.json --function uint256_test --inputs 0 340282366920938463463374607431768211457 --no_wallet --feeder_gateway=http://127.0.0.1:5050
1
```

And here we get 1, which means that `(0, 340282366920938463463374607431768211457)` passed the check. To understand why this happens we need to look at the functions involved in this:

*uint256_le*

```javascript 
# Returns 1 if the first unsigned integer is less than or equal to the second unsigned integer.
func uint256_le{range_check_ptr}(a : Uint256, b : Uint256) -> (res : felt):
    let (not_le) = uint256_lt(a=b, b=a)
    return (1 - not_le)
end
```

*uint256_lt*

```javascript 
# Returns 1 if the first unsigned integer is less than the second unsigned integer.
func uint256_lt{range_check_ptr}(a : Uint256, b : Uint256) -> (res : felt):
    if a.high == b.high:
        return is_le(a.low + 1, b.low)
    end
    return is_le(a.high + 1, b.high)
end
```

*is_le*

```javascript 
# Returns 1 if a <= b (or more precisely 0 <= b - a < RANGE_CHECK_BOUND).
# Returns 0 otherwise.
func is_le{range_check_ptr}(a, b) -> (res : felt):
    return is_nn(b - a)
end
```

So, the `RANGE_CHECK_BOUND` is `2 ** 128`, and our value is greater than that by just `1`. The way that the check process would work is the following:

1. `uint256_le(Uint256(0, 2 ** 128 + 1), Uint256(0 ,0))`
2. `uint256_lt(Uint256(0, 0), Uint256(0, 2 ** 128 +1))`
3. `is_le(0 + 1, 2 ** 128 + 1)`
4. `is_nn((2 ** 128 + 1) - 1)`
5. Now `2 ** 128 + 1 - 1` will result in `2 ** 128` which is the max value of the `RANGE_CHECK_BOUND` thus `is_nn` would return 0 (as you can see from the comments - it returns `1` if `0 <= b - a < RANGE_CHECK_BOUND`)
6. Having returned `0`, we go back to `uint256_le`
7. `return (1 - 0)`
8. We have `1` thus the comparison holds true

If we did the same with a number smaller by just `1`, we would have the following:

1. `uint256_le(Uint256(0, 2 ** 128), Uint256(0 ,0))`
2. `uint256_lt(Uint256(0, 0), Uint256(0, 2 ** 128))`
3. `is_le(0 + 1, 2 ** 128)`
4. `is_nn((2 ** 128) - 1)`
5. Now `2 ** 128 - 1` is just below the `RANGE_CHECK_BOUND` thus `is_nn` would return 1 
6. Having returned `1`, we go back to `uint256_le`
7. `return (1 - 1)`
8. We have `0` thus the comparison holds false

Both in the CTF, and in the example above, adding a `uint256_check` at the beginning of the function, would solve this issue and given the above `Uint256`, the call would revert. 

```javascript 
@view 
func uint256_test_check{
    syscall_ptr : felt*, 
    pedersen_ptr : HashBuiltin*, 
    range_check_ptr
    } (num: Uint256) -> (res: felt):
    with_attr error_message("invalid uint256"):
        uint256_check(num)
    end 
    let zero: Uint256 = Uint256(0, 0)
    let (check) = uint256_le(num, zero)
    return (check) 
end 
```

Trying to call the function above with the same value as before would result in an assertion being thrown:

```bash 
tarknet call --address 0x018bbff3ce2473f7e779fbc2442cc5f0a5617789250862cba0512e2df304f70b --abi artifacts/abis/contract.json --function uint256_test_check --inputs 0 340282366920938463463374607431768211457 --no_wallet --feeder_gateway=http://127.0.0.1:5050
Got BadRequest while trying to access http://127.0.0.1:5050/feeder_gateway/call_contract?blockNumber=pending. Status code: 500; text: {"message":"/home/ctrlc3/.local/lib/python3.8/site-packages/starkware/cairo/common/uint256.cairo:23:5: Error at pc=0:193:\nValue 340282366920938463463374607431768211457, in range check builtin 1, is out of range [0, 340282366920938463463374607431768211456).\n    [range_check_ptr + 1] = a.high\n    ^****************************^\nCairo traceback (most recent call last):\ncontracts/contract.cairo:67:6: (pc=0:505)\nfunc uint256_test_check{\n     ^****************^\nError message: invalid uint256\ncontracts/contract.cairo:73:9: (pc=0:473)\n        uint256_check(num)\n        ^****************^","status_code":500}
```

If you want to play with this CTF's Cairo challenges, `amanusk` was kind enough to push their [solutions](https://github.com/amanusk/cairo-paradigm-ctf) as well as some instructions on how to run the challenges locally. In total there are three Cairo challenges. 


### Integer Overflow/Underflow

The history of integer over/underflows in computer science is a long and eventful story due to how data types are stored in memory. ([Y2K22](https://www.welivesecurity.com/2022/02/21/integer-overflow-how-it-occur-can-be-prevented/) anyone?)

This vulnerability boils down to unsafe conversion between signed and unsigned variables and integer variable types of different sizes. It is generally permitted to convert between these different types and, in many cases, the results actually make sense. However the result of an unsafe typecast can be catastrophic when dealing with sensitive values such as funds within a smart contract.

Aside casting between data types, Cairo does not automatically throw a revert if the result of a math operation results in a value greater than what the data type can hold. In this case, if we add 2 to the highest value a `felt` can hold, the result will roll over and will be 1.

Let's have a look at a very simple example where we are going to overflow a `felt`:

```javascript 
@view 
func overflow{
    syscall_ptr : felt*, 
    pedersen_ptr : HashBuiltin*, 
    range_check_ptr
    } (num1: felt, num2: felt) -> (res: felt):
    return (num1 + num2) 
end 
```

Here we are accepting two numbers and adding them up. If we pass the max value that a felt can hold, and the number 10, the contract will return the number 9 to us, as shown below.

```bash 
starknet call --address 0x018bbff3ce2473f7e779fbc2442cc5f0a5617789250862cba0512e2df304f70b --abi artifacts/abis/contract.json --function overflow  --inputs 10 3618502788666131213697322783095070105623107215331596699973092056135872020480  --no_wallet --feeder_gateway=http://127.0.0.1:5050
9
```
Note that the above will hold true for all other operations, subtraction, multiplication etc, so please  always exercise caution. 
On top of that, should you need to implement custom types, such as `uint64` or `uint128`, make sure than when casting between types you implement safety checks such as the ones implemented by `uint256_check`, which makes sure that a `Uint256` is composed of two values at most of 128 bits each (of course adapting this to your specific type). 

So how do you prevent overflows? There are a number of secure libraries for math operations that should be used when writing Cairo contracts:

* [felt library from Nethermind](https://github.com/NethermindEth/Cairo-SafeMath)
* [Uint256 library from OpenZeppelin](https://github.com/OpenZeppelin/cairo-contracts/blob/main/src/openzeppelin/security/safemath.cairo)


## L1<>L2 Operations

> More details on this section will be added as more interoperable protocols are built and audited. 

StarkNet is designed to allow communication with L1 contracts using `L1<>L2` messages. This extends the trust boundry of the smart contracts to send data between the two chains, potentially leading to complex cross chain attacks.

In a nutshell, contracts on both Ethereum Mainnet/Testnet and StarkNet can send messages between each other. The messages from L2 are bundled automatically with the contract address sending it, and are posted on L1 to be stored on the L1 StarkNet core contract. The receiver L1 contract can then consume the message by calling the StarkNet core contract. 

It is highly recommended that arbitrary messages are not accepted and that a check on L1 is added to ensure that a message is coming from the expected origin.

On the other hand, when sending messages from L1 to StarkNet, the message needs to be posted with the selector of the function that the sequencer should call on the L2 contract. The following is quoted from StarkNet's documentation:

> Note that while honest Sequencers automatically consume L1 -> L2 messages, it is not enforced by the protocol (so a Sequencer may choose to skip a message). This should be taken into account when designing the message protocol between the two contracts.

After reading the above, it is clear that while this is a very useful feature, an appropriate plan should be created before incorporating it into your protocol. 

Please refer to [Starknet's documentation](https://starknet.io/docs/hello_starknet/l1l2.html) to see how it all works in more details.  

### Lack of Addresses Sanity Checks

With the additional complexity of sending messages between L1 and L2 chains, there can be issues with data type mismatches for elements such as addresses if the L1 address is not properly validated on L2. L1 addresses have 160 bits which is less than the number of bits a single `felt` type can hold.

In summary, checks should be added when dealing with addresses to ensure that the L1 address is valid.

Chainsecurity performed an [audit](https://chainsecurity.com/wp-content/uploads/2021/12/ChainSecurity_MakerDAO_StarkNet-DAI-Bridge_audit.pdf) of MakerDAO DAI Bridge (Eth mainnet <> StarkNet). This is a great report which we recommend anyone to read (the part where they describe how the protocol works was very useful and something that most auditing companies miss in their reports).

Here is an extract of one of their findings:

> The `deposit()` function of the `L1DAIBridge` contract allows users to deposit with the `to` address set to `0`. The execution of `finalize_deposit` initiated by the `l1_handler` on L2 however will fail as minting DAI for the zero address will revert. As a result the deposited DAIs on L1 will be locked in the escrow.

We can see here that because of the lack of validation on L1, user funds could have been stuck in the escrow contract.

Another example is given by Crytic (ToB) on their [not-so-smart-contracts repo](https://github.com/crytic/building-secure-contracts/tree/master/not-so-smart-contracts/cairo/L1_to_L2_address_conversion). 

## Re-Entrancy

Re-entrancy attacks have a sordid history on L1 chains such as Ethereum for the potential to cause catastrophic financial damage to contracts that do not implement strong re-entrancy guards. The most impactful of these resulting in the [forking of Ethereum](https://coinmarketcap.com/alexandria/article/a-history-of-the-dao-hack) back in 2016, re-entrancy attacks are still actively [exploited in the wild](https://www.coindesk.com/tech/2022/03/31/ola-finance-exploited-for-36m-in-re-entrancy-attack/) in 2022.

Re-entrancy is possible within StarkNet too, so make sure to use re-entrancy guards. As mentioned this issue is still actively exploited in many smart contracts languages, and while devs are more frequently using the appropriate libraries where needed, guards should be used in all StarkNet contracts as well (where appropriate of course). 

On top of that, and probably even more importantly, devs should always remember to follow the [check-effect-interaction](https://fravoll.github.io/solidity-patterns/checks_effects_interactions.html) pattern which states:

> "We should not make any changes to state variables, after interacting with external entities, as we cannot rely on the execution of any code coming after the interaction" - [fravoll website](https://fravoll.github.io/solidity-patterns/checks_effects_interactions.html).

Luckily OpenZeppelin has implemented a [re-entrancy guard](https://github.com/OpenZeppelin/cairo-contracts/blob/main/src/openzeppelin/security/reentrancyguard/library.cairo) for Cairo as well.

This can be used as follow:

```javascript
ReentrancyGuard._start()

[you code here]

ReentrancyGuard._end()
```

The code is very simple but effective:

```javascript 
func _start{
        syscall_ptr: felt*,
        pedersen_ptr: HashBuiltin*,
        range_check_ptr
    }():
    let (has_entered) = ReentrancyGuard_entered.read()
    with_attr error_message("ReentrancyGuard: reentrant call"):
        assert has_entered = FALSE
    end
    ReentrancyGuard_entered.write(TRUE)
    return ()
end

func _end{
        syscall_ptr: felt*,
        pedersen_ptr: HashBuiltin*,
        range_check_ptr
    }():
    ReentrancyGuard_entered.write(FALSE)
    return ()
end
```

We can see, that by adding `ReentrancyGuard._start` at the beginning of a function (and don't forget to add `ReentrancyGuard._end`), should the function be re-entered, the `ReentrancyGuard._start` would be triggered again, and after looking up storage again it would see that `has_entered` is now `TRUE` leading to the assertion failing.

The above was taken from OZ's repo, where there are some mock contracts which show a couple of examples where the reentrancy guard is in use:

* [target_contract](https://github.com/OpenZeppelin/cairo-contracts/blob/main/tests/mocks/ReentrancyMock.cairo)
* [attacker](https://github.com/OpenZeppelin/cairo-contracts/blob/main/tests/mocks/ReentrancyAttackerMock.cairo)

To sum up, always follow the checks-effects-interaction pattern where possible, and when interacting with external contracts, make sure that appropriate safeguards are in place such as the aforementioned reentrancy guard.

## Exposing unwanted external functions 

Due to how StarkNet smart contracts work, if you import a module with external functions in your contract, they will be automatically exposed. Most often than not, this is something that you might want, but it is important to make sure that sensitive functions are not exposed. Imagine you missed access control there, and an attacker could steal funds. 

In order to counter this, developers should follow the ***Extensibility*** [pattern](https://docs.openzeppelin.com/contracts-cairo/0.3.1/extensibility). The linked version is the most up-to-date one released by OpenZeppelin. 

In short, code should be divided in libraries and contracts. Reusable logic and storage variables should go into a library, which are not to be deployed. These should be then imported as appropriate in the smart contract inside external or internal functions as deemed necessary by the developers. For more details, please read OZ's post. 

One cool example was proposed in 2022's Paradigm CTF. The `cairo-proxy` [challenge](https://ctf.paradigm.xyz/challenges/cairo-proxy), exposed an external function which allowed anyone to change the storage of a contract (there was another mistake here related to the Proxy pattern but that's for another section). From this point, one could be solving the challenge in different ways, for instance by changing the initialized state of the contract and re-initializing it to be the `owner`, or directly change the owner and mint new tokens, or amending its balance. 

An example of the `Utils.cairo` code with a dangerously exposed `external` function has been included below:

```javascript
%lang starknet

from starkware.starknet.common.syscalls import storage_read, storage_write, get_caller_address

[snip]

@external
func auth_write_storage{
        syscall_ptr : felt*,
    }(auth_account : felt, address : felt, value : felt):
    let (caller) = get_caller_address()

    assert caller = auth_account

    storage_write(address=address, value=value)
    return()
end
```

Given a `storage_var` key and a value, an user could overwrite the storage of the `almost_erc20` contract. 

We can see another example on `Crytic`'s [repo](https://github.com/crytic/building-secure-contracts/tree/master/not-so-smart-contracts/cairo/dangerous_public_imports_in_libraries).

## View Functions that modify the state 

While Solidity developers might be used to the pattern that `view` functions do not modify state, this is not enforced in StarkNet **yet**. Therefore, leaving some functionality in a `view` function that modifies state, might be very dangerous. 

Until this is enfocred, it is recommended to make sure that `view` function are only used to read data from storage or to perform certain calculations (something like a helper function which you want to make public). 

We can see an example in `Crytic`'s [repo](https://github.com/crytic/building-secure-contracts/tree/master/not-so-smart-contracts/cairo/view_state).

## Missing Pausing functionality 

Thanks to OpenZeppelin, we have the `Pausable` library available which permits contracts to be paused by one account (usually the owner or a specific role which can only pause contracts). This is extremely useful as in the event of an attack, devs can quickly pause the contract and prevent further exploits, while they work on mitigating/fixing the issue.

This is as simple as adding the following function call to contract functions from [cairo-contracts]( https://github.com/OpenZeppelin/cairo-contracts/blob/main/src/openzeppelin/security/pausable/library.cairo):

```javascript
Pausable.assert_not_paused()
```

And then use `_pause` and `_unpause` to pause the contract.

The following extract from one of the mock contracts of OZ's library is show below, where all of these functions are in use.

```javascript
from openzeppelin/security/pausable/library import Pausable

@external
func normalProcess{
        syscall_ptr: felt*,
        pedersen_ptr: HashBuiltin*,
        range_check_ptr
    }():
    Pausable.assert_not_paused()

    let (currentCount) = count.read()
    count.write(currentCount + 1)
    return ()
end

@external
func pause{
        syscall_ptr: felt*,
        pedersen_ptr: HashBuiltin*,
        range_check_ptr
    }():
    # Ownable.onlyOwner() not part of the mock code but added for correctness
    Pausable._pause()
    return ()
end

@external
func unpause{
        syscall_ptr: felt*,
        pedersen_ptr: HashBuiltin*,
        range_check_ptr
    }():
    # Ownable.onlyOwner() not part of the mock code but added for correctness
    Pausable._unpause()
    return ()
end
```

Of course, for the `pause` and `unpause` functions, make sure you are using strong access controls to prevent unintended actors from calling these functions in your contracts.

## Signature Replay Attacks

These types of attacks are very common in Solidity and there are various types of them:

* Traditional Replay attacks - we will go into detail below
* Cross-Chain replay attacks - (In StarkNet it will be a problem when a signature on testnet can be replayed on mainnet). The solution in Solidity is to use an hash separator with the `chainId` and data that identifies one contract from the other, so the same should be followed where appropriate
* Signature malleability attacks (these will be dependent on the implementation)

One key takeaway from these attacks is to always make sure that an unique value (often called a ***nonce***) is used. For instance, in token contracts that allow transfers via signatures (hence allowing the entity which originates the request to not pay any gas fee as the signature is done off-chain), it would be nice to keep a mapping of nonce values for each users. Something like the example below:

```javascript
@storage_var
func nonces(address: felt) -> (nonce: felt):
end 
```

Each time we make use of the nonce in our function calls, we should increase it by one, and our signing infrastructure should first fetch the current nonce value, and create a signature for the transaction. 

Let's look at some vulnerable code. For this we assume that we have a contract for a Play-2-Earn (P2E) browser-based game. Users can play in their browser, and once they finish the game, they are rewarded some in-game (and fully off-chain) currency. This currency is exchangeable 1-1 to the ecosystem token, and users need a valid signature for the contract call to work (note that this needs to be signed by a `signer` controlled by the protocol and include the user's address and amount of tokens). 

To keep this example as simple as possible, let's assume that the in-game currency supply is infinite (We know, not too smart considering it is exchangeable 1-1 with the ecosystem token).

The code in charge of converting the in-game currency to the ecosystem token is the following:

```javascript
@external
func swap_game_currency{
    syscall_ptr : felt*, 
    pedersen_ptr : HashBuiltin*, 
    range_check_ptr,
    ecdsa_ptr : SignatureBuiltin*
    }(
        r: felt, 
        s: felt,
        amount: felt 
    ):
    alloc_locals
    let (local caller_address) = get_caller_address()
    let (_signer) = signer.read()
    let (message) = hash2{hash_ptr=pedersen_ptr}(amount, caller_address)

    verify_ecdsa_signature(
        message=message, public_key=_signer, signature_r=r, signature_s=s
    )

    let (token_address_) = token_address.read()
    let (contract_address) = get_contract_address()

    IERC20.transferFrom(contract_address=token_address_, sender=contract_address, recipient=caller_address, amount=Uint256(amount, 0))

    return ()
end
```

This function accepts the amount and the signature values `r` and `s`. If the signature checks out, it will get the address of the ecosystem token, and transfer the amount to the caller. An attacker could replay the transaction and call this function as many times as they like, as long as the `amount` parameter is the same of the original signed message. 


The "safe" version of this code is presented below:

```javascript
@external
func swap_game_currency_safe{
    syscall_ptr : felt*, 
    pedersen_ptr : HashBuiltin*, 
    range_check_ptr,
    ecdsa_ptr : SignatureBuiltin*
    }(
        r: felt, 
        s: felt,
        amount: felt 
    ):
    alloc_locals
    let (local caller_address) = get_caller_address()
    let (local nonce) = nonces.read(caller_address)
    let (_signer) = signer.read()

    # update nonce 
    nonces.write(caller_address, value=nonce+1)

    let (message) = hash2{hash_ptr=pedersen_ptr}(amount, caller_address)
    let (message_part_2) = hash2{hash_ptr=pedersen_ptr}(message, nonce)

    verify_ecdsa_signature(
        message=message_part_2, public_key=_signer, signature_r=r, signature_s=s
    )

    let (token_address_) = token_address.read()
    let (contract_address) = get_contract_address()

    IERC20.transferFrom(contract_address=token_address_, sender=contract_address, recipient=caller_address, amount=Uint256(amount, 0))

    return ()
end 
```

As you can see, what we do differently here is add a ***nonce*** value to the function. As mentioned above, the backend would first pull the nonce value for an account, and use it to generate the signature. For each function call, the current user nonce is pulled from storage, and increased by 1, so that the next call will use the updated value.

## Storage Variable Name Clashing

TLDR - Name storage variables differently in contract libraries as if you import a namespace, two storage variables with the same name will confuse the compiler.

As Andrew Fleming from OZ states:

> "The interesting question with this pattern is: if libraries set their own state with storage variables, what happens when a contract imports from multiple libraries that share the same name for those storage variables?"

His [blog-post](https://medium.com/coinmonks/storage-variable-clashing-in-starknet-ce5f28e60886) has the perfect example which shows how this bug works, please refer to that article.

The proposed solution is to name storage variables accordingly. For instance two storage variables both meant to be storing some balance, could be named as:

* `LibraryA_balance`
* `LibraryB_balance`

And if you want to have a go at exploiting this vulnerability, here is the [winning](https://github.com/milancermak/cairo-underhanded) submission of the Cairo underhanded challenge. (Contest by [Nethermind](https://twitter.com/nethermindeth) and submission by [@milancermak](https://twitter.com/milancermak)).

## Interacting with Arbitrary Tokens 

When interacting with arbitrary tokens, always make sure that transfers are validated with appropriate balance checks as these tokens might not implement the same logic on transfer.

Imagine you are using some untrusted token in your contract. We recommend to check that the balance before, and the balance after match the amount transferred. This could be the case in a AMM with no limitation as to which token can be exchanged. 

Pseudo-code steps:

```javascript
let balance_before = balances.read(user1)
transfer(token, receiver, amount)
let balance_now = balances.read(user2)
if balance_now != balance_before + amount: revert("Transfer failed")
```

Let's take as an example a super simple and probably buggy "malicious" token that slightly modified OpenZeppelin's ERC20 library:

```javascript
@external
func transferFrom{
        syscall_ptr : felt*,
        pedersen_ptr : HashBuiltin*,
        range_check_ptr
    }(
        sender: felt,
        recipient: felt,
        amount: Uint256
    ) -> (success: felt):
    alloc_locals
    # check amount if the amount is >= 2
    let (is_le_two) = is_le(2, amount.low)
    let (contract_address) = get_contract_address()
    if is_le_two == 1:
        let (new_amount: Uint256) = SafeUint256.sub_lt(amount, Uint256(1, 0))
        ERC20.transfer_from(sender, recipient, new_amount)
        ERC20.transfer_from(sender, contract_address, Uint256(1, 0))
    else:
        ERC20.transfer_from(sender, recipient, amount)
    end 
    return (TRUE)
end
```

Here we changed the transfer to subtract one token from each transfer if the amount transferred is greater or equal than two. 

Now let's look at a simple contract that allows someone to pay someone else (it's not a realistic example, but it would work to explain this concept).

```javascript
@external
func pay_someone{
    syscall_ptr : felt*, 
    pedersen_ptr : HashBuiltin*, 
    range_check_ptr
    }(
        amount : Uint256, 
        receiver: felt,
        token: felt
    ):
    let (sender) = get_caller_address()
    IERC20.transferFrom(contract_address=token, sender=sender, recipient=receiver, amount=amount)
    return ()
end
```

This function simply takes the caller address, and calls `transferFrom` to transfer assets to the specified receiver. 

How do we make this function "safe"?

```javascript
@external 
func pay_someone_safe{
    syscall_ptr : felt*, 
    pedersen_ptr : HashBuiltin*, 
    range_check_ptr
    }(
        amount : Uint256, 
        receiver: felt,
        token: felt
    ):
    let (sender) = get_caller_address()
    let (balance_before) = IERC20.balanceOf(contract_address=token, account=receiver)
    IERC20.transferFrom(contract_address=token, sender=sender, recipient=receiver, amount=amount)
    let (balance_after) = IERC20.balanceOf(contract_address=token, account=receiver)
    let (calculated_balance: Uint256) = SafeUint256.add(balance_before, amount)
    let (is_equal) = uint256_eq(balance_after, calculated_balance)
    with_attr error_message("The balance is not correct"):
        assert is_equal = 1
    end 
    return ()
end 
```

What we do above, is to get the balance before the transfer and store it in a variable. Then we proceed with the transfer, and check the balance again. 
Finally, we revert if the previous balance + the amount transferred is not equal to the new balance. 

A token doesn't have to be malicious for this to apply, we've seen in the past that certain tokens charge a fee on transfer (which might or might not go towards the liquidity pool, but that's another story), protocols should consider whether to allow these types of tokens to be used in their protocol. When in doubt, always implement the checks described above to be on the safe side. 

## Missing Zero Address Checks

In StarkNet, you can send transactions without using a contract account. The syscall `get_caller_adress` will always return zero in that case. 

Imagine you were able to transfer tokens to the address zero by mistake (OZ libraries prevent that actually but this is an example), now someone could directly call the contract and steal those funds. 

To mitigate this vector it is possible to use the `assert_not_zero` function from the [Cairo math lib](https://github.com/starkware-libs/cairo-lang/blob/master/src/starkware/cairo/common/math.cairo). This will ensure that the address is not zero'd by mistake or design. 

>Please note that this will likely not be a problem anymore as mandatory fees are fully introduced, as it will not be possible to directly call a contract. 
>
> We would still recommend exercising caution especially with addresses, and making sure that transferring ownership to the address zero (unless of course someone is renouncing ownership of a contract) should be prevented. 
>
>Here on the OZ cairo contract [repo](https://github.com/OpenZeppelin/cairo-contracts/issues/148) there is a short discussion of the matter, related to an issue that was identified in their `ERC721` contract just before release of the first version of `cairo-contracts`.

## Missing Zero Value Checks

Similar to the attack vector described above, it is important to check that non-address values are also not zero. While addresses are always of type `felt`, we will include `Uint256` values too. 

In order to prevent values from being zero, we can use the `assert_not_zero` function from the library mentioned above on `felt` values. Additionally, you can use it on the `.low` and/or `.high` part of a Uint256 (which are a felt as we discussed in sections above).

There are other libraries to compare values that can also be used, such as the ones found in StarkNet's `math_cmp` library. 

What is important here, is that values are always within an acceptable boundary, this way we can mitigate both malicious and benign mistakes. 
Of course, there will be cases where allowing zero (or any value) is appropriate, such as a lending protocol where admin can set the fees, or allowing arbitrary fees that (based on some extra logic) would result in a pool being disabled. As such, developer discretion should be used when handling zero values.

## Toolchain and Best Practices

### Use standard and/or reputable and tested libraries

While the ecosystem is relatively new and there are certain libraries still missing, it is recommended to use standard and tested libraries for everything.

Please refer to the official [Cairo repo](https://github.com/starkware-libs/cairo-lang) and [OpenZeppelin’s cairo-contracts](https://github.com/OpenZeppelin/cairo-contracts), as well as other reputable libraries that you can find on [Cairo Goldmine](https://github.com/beautyisourbusiness/cairo-goldmine).

### Use up-to-date Cairo versions

Cairo is changing very quickly and therefore it is important to keep up to date with latest developments and ensure that code is developed and deployed using the latest and most stable versions of the Cairo programming language. This should also apply to the toolchain used by developers in their day to day operations. Also, in terms of functionality, it is likely that a new version will introduce just that one feature you thought Cairo was missing.

Also, keep an eye out for security fixes in the changelog of your used libraries.

## Upgradable Contracts

How do you make contracts upgreadable? Well thanks to OpenZeppelin libraries and StarkNet's design, it is possible to implement these in a simple way.

Please refer to their [guide](https://docs.openzeppelin.com/contracts-cairo/0.3.1/proxies) for the official explanation. In terms of security, what we want to make sure is that our implementation contracts are initialized by the contract developers, and that sensitive functions (such as `upgrade`) are protected by access control. 

Let's look at an example (one that works correctly).

Here is the default Proxy preset provided by [OZ](https://github.com/OpenZeppelin/cairo-contracts/blob/main/src/openzeppelin/upgrades/presets/Proxy.cairo). This is very simple, has the `__default__` function (which is like our fallback in Solidity), a L1 handler, and a constructor. 
Before deploying this contract, developers should make sure to declare the contract class of their implementation contract. 
After, they can deploy the Proxy contract and pass the `implementation_hash` as parameter.

The actual Proxy library contract contains a couple of `storage_var` as seen below:

```javascript
@storage_var
func Proxy_implementation_hash() -> (class_hash: felt):
end

@storage_var
func Proxy_admin() -> (proxy_admin: felt):
end

@storage_var
func Proxy_initialized() -> (initialized: felt):
end
```

What would happen if someone was able to initialize your implementation contract before you? 

Most of the times, developers would realize that and simply re-deploy and initialize again, however that might end up costing more gas than expected. If the developers do not realize that their contract was initialized by another party, this could be very problematic. For instance, this could happen if the initialization function is not throwing an error and silently return even if already initialized. An attacker that was able to initialize certain contracts, would likely be set as the admin of the contract and perform various attacks based on the contract's functionalities. 

To counter this, always use the `initializable` [library](https://github.com/OpenZeppelin/cairo-contracts/blob/main/src/openzeppelin/security/initializable/library.cairo) for contracts that have init functions, as well as make sure that your deployment includes initialization. 

On top of OpenZeppelin's documentation linked above, a detailed guide on how to use the Proxy pattern is provided by Empiric Network [here](https://medium.com/@EmpiricNetwork/starknet-guide-writing-upgradable-contracts-using-a-proxy-af3f107f238b).

### Deploying your implementation contract 

Reading off StarkNet's official documentation:

> Unlike Ethereum, StarkNet distinguishes between a contract class and a contract instance. A contract class represents the code of a contract (but with no state), while a contract instance represents a specific instance of the class, with its own state.

One mistake that StarkNet's developer can make, is to actually deploy the implementation contract, not just the proxy (we can see an example on this year [Paradigm CTF](https://github.com/amanusk/cairo-paradigm-ctf/blob/main/paradigm-ctf-infrastructure/images/cairo-challenge-base/cairo_sandbox/proxy-chal.py)). The implementation is supposed to be declared as a contract class, and the hash passed to the Proxy constructor so that it knows where to delegate its calls. 

The whole purpose of using a proxy pattern, thus using the storage of the Proxy and functionality of the implementation would not be fulfilled in this case, as someone would just be able to directly interact with the implementation contract, which would have its own state. 

To recap, always make sure that your implementation contracts are declared first, and then only the Proxy(s) are deployed. Finally, initialize the implementation contract via the Proxy. Some more details on how contract classes work is described on Starknet's [documentation](https://docs.starknet.io/docs/Contracts/contract-classes).

You can declare a contract class in different ways with either `nile` or directly with the `starket-cli` (plus using all other tools available or SDKs):

* `starknet declare --contract contract_compiled.json`
* `nile declare contract_name`

The output would look something like this:

```bash 
Declare transaction was sent.
Contract class hash: 0x1e2208b571b2cb68908f37a196ed5e391c8933a6db23bb3939acedee40d9b8a
Transaction hash: 0x762e166dd3326b2e263eb5bcfdccd225dc88e067fdf7c92cf8ce5e4ea01f9f1
```

As stated above, the contract class hash should then be passed to the Proxy constructor as follow:

```bash 
nile deploy proxy 0x1e2208b571b2cb68908f37a196ed5e391c8933a6db23bb3939acedee40d9b8a --alias my_proxy
```

## Oracles 

Oracles are the go to solution for accessing off-chain data on-chain. These are used for receiving price feeds, or other data needed in a smart contract like a random number. 

### Price Feeds 

In StarkNet we have two working price feed oracles (apologies if we missed any):

* [Empiric Network](https://empiric.network/)
* [Stork](https://www.stork.network/)

Always use price feeds from reputable sources when you need to fetch token prices on chain. Let's take as an example a protocol that makes use of stablecoins. We have seen in the past that stablecoins sometimes are not that stable, and it happens sometimes that protocols just assume that their price will always be one dollar (yes this really happens).   

Imagine if this one stablecoin now depegs, and people are able to get discounted loans on a lending protocol because they can buy that token for half price, while the protocol always counts it as 1$. Well, our friendly devs above, made a pretty easy to use solution for us, so make good use of it. 

For Empiric Network, you can use the following [guide](https://docs.empiric.network/quickstart), and [this one](https://docs.stork.network/quick-start) for Stork. 

All it really takes is just a couple of lines as shown below (plus of course a couple of other variables you want to use to store the feeds keys):

```javascript 
@view
func my_func{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
}() -> ():
    let (eth_price,
        decimals,
        last_updated_timestamp,
        num_sources_aggregated) = IEmpiricOracle.get_value(
            EMPIRIC_ORACLE_ADDRESS, KEY, AGGREGATION_MODE
        )
    # Your smart contract logic!
    return ()
end
```

Please note the risk of trusting a third-party, so make your due diligence before choosing which option to implement in your contract. 

### Pseudo Random Number Generators

Whenever you need to generate random values in your code, please refrain from using methods like using the block number, or using contract addresses, etc.. In Solidity, we have it easy with ChainLink, just pay the fee, and get all the needed verifiable random numbers in your contract.

With StarkNet, solutions are being built as we speak:

* Empiric Network is working on their implementation
* 0xNonCents just deployed a [VRF](https://twitter.com/0xNonCents/status/1555288515314946049) in the Testnet 
* Someone else? Maybe ChainLink or a bridge for VRF from mainnet to StarkNet? (a bridge might be very expensive compared to a native solution though)

Imagine someone was using a contract address modulo some number as a source of randomness, this could go really bad.

A contract address will be the result of the formula below (please refer to the [technical documentation](https://docs.starknet.io/docs/Contracts/contract-address) for more details):

```golang
contract_address := pedersen(
    “STARKNET_CONTRACT_ADDRESS”,
    caller_address,
    salt,
    pedersen(contract_code),
    pedersen(constructor_calldata))
```

With the right amount of time, an attacker might be able to deploy a contract with an arbitrary address that would result in the "randomness" being bypassed, so make sure you stick to using a VRF.

As with the Price Feeds section above, exercise caution when using third-party code, make sure this is open source and can be verified, as requesting a random number from a Oracle would usually result in their contract making a call to your contract. Always check that the VRF callback function is protected from reentrancy (should it implement further logic than just storing the number) and that it can only be called from the Oracle contract address. 

## Logic Flaws

As with any system, developers implementing business logic may make  mistakes which could result in loss of funds. We believe it is difficult to generalize these type of bugs, and it is up to the auditor and their past experience to find them. Often, these bugs encompass portions of all other bugs that have and will be described in this post. 

This is why performing extensive auditing is essential to the development of contracts on any platform.

> We will update this section as more audits are conducted and examples are made public.

## Frontrunning 

Is frontrunning a thing in StarkNet? Well, AFAIK there is no public mempool (yet?).. But I would still exercise caution. Also, things might change with the introduction of decentralized sequencers, some people talk about sequencer extractable value.

For instance, let's imagine the example below.

We have a marketplace which allows people to sell tickets for a football game (in an imaginary world where event tickets are NFTs). Sellers will create a sell offer and lock their ticket in the contract. Now, the protocol's code will have the following `sellTicket` function:

```javascript
sellTicket(ticketId: felt, price: felt)
```

This function above will store the ticket in a storage variable such as the following:

```javascript 
@storage_var
func tickets_on_sale(ticketId: felt) -> (price: felt)
```

The buyer, can buy one of these tickets using a nice frontend or directly calling the contract, and the function call would be something like this:

```javascript
buyTicket(ticketId: felt)
```

Now, what would happen if before this legitimate `buy` transaction goes through, someone else has their transaction validated first and buys the ticket, then puts it on sale again for a higher price (which should be less or equal to the allowance that was given to the contract from the legitimate buyer). The attacker would have made a very quick profit on this, and the buyer would find themselves with less funds than expected. This of course assumes that the legitimate buyer set an allowance great enough for the attack to be profitable.

While this is a simple example and way more complex frontrunning attacks can be found all around Solidity smart contracts, the solution is also simple. Add the price of the ticket in the `buy` function (and if the contract allows sales with multiple currencies, also the currency):

```javascript
buyTicket(ticketId: felt, price: felt)
```

The function should validate that the price stored in the contract matches the price passed as parameter (which the caller, or the frontend system, should have gotten before initiating the transaction).

These types of attacks are very common in this world, especially in AMMs, where MEV bots would sandwich transactions in low liquidity pools, should they see they can make a good profit (and would most often than not this would include a flashloan).

## Governance Attacks 

With Solidity, we have seen many governance attacks being carried out. For instance, protocols counting voting power based on the balance of the caller on the time of calling a function (flashloans anyone?), or not enforcing a timelock on a proposal, and allowing malicious users from self-approving and executing the proposal straight away. 

Will the same mistakes be made in StarkNet's protocols too?

> This section will be updated as the authors find the time to implement some example scenarios, or others are made public. 

## Denial of Service (DoS)

> This is an area which needs more research, and will be updated soon. 

Outside of StarkNet, we observed denial of service scenarios in a number of cases:

* Contracts using external paid services like ChainLink's VRF and allowing anyone to instantiate a request (thus making the contract pay `$LINK` tokens)
* Users blocking refunds by `reverting` in a smart contract's fallback function (observed in NFT mint contracts which include refunding gas to all minters in a for loop)
* Reaching block gas limit by large loops making external calls 

It will be interesting seeing what opportunities for DoS are encountered in StarkNet (and hopefully caught first by an audit).

To conclude (for now), we should consider that at this stage of StarkNet's life, transactions can be censored. As of the time of writing this first iteration of this post, the sequencer is centralized. Therefore, it might be possible that transactions are censored and this can cause huge damage. We have seen this described by ChainSecurity in their MakerDAO DAI bridge [report](https://chainsecurity.com/wp-content/uploads/2021/12/ChainSecurity_MakerDAO_StarkNet-DAI-Bridge_audit.pdf). Things will of course change as decentralized sequencers are introduced in StarkNet.

## Not using Static Code Analyzers 

While static code analysis should not be considered as a replacement of a security audit, they can help find low-hanging fruits in your Cairo code (or any other code), so why not use them? 

Trail of Bits developed [Amarna](https://github.com/crytic/amarna). For more information please refer to their GitHub and to their blog post [here](https://blog.trailofbits.com/2022/04/20/amarna-static-analysis-for-cairo-programs/). For instance, ***Amarna*** will detect some of the issues being described here, such as `view` functions modifying state, or `storage_var` name clashing. 

Our kind [@franalgaba](https://github.com/franalgaba) and [@milancermak](https://github.com/milancermak) have written [this](https://github.com/franalgaba/pre-commit-cairo) Cairo pre-commit hook that can run your code through some checks while committing the code.

## How do you prepare for an audit? 

Every respectable project that wants to launch, should undergo a security audit before going live. This is important, as even if your devs are the "best", humans make mistakes. 

As a rule of thumb, and if funding allow it, you should aim  to have two companies audit your project, so that if someone misses something, there is a very good chance the other auditor/s find it. Also, running a bug bounty program on a platform such as [Immunefi](https://immunefi.com/) is a good way to incentivize white hat hackers to look at your code and help you. Finally, [Code4rena](https://code4rena.com/) is a great way to have some of the best minds in blockchain security try to break your code.

Going back to answering the question of how to prepare for an audit, we recommend to follow this checklist:

- [ ] Make sure that the code is well commented 
- [ ] Make sure that appropriate documentation is produced (more often than not, writing up documentation will lead you to find some bugs yourself)
- [ ] Implement thorough test cases (Auditors really appreciate that)
- [ ] Research audit companies and choose one which fits your budget and which you would feel safe with
- [ ] Identify areas of concern which you believe that might have bugs (This gives the auditor a good starting point)
- [ ] Gather documentation and updated deployment scripts to allow auditors to hit the ground running

## Testing Tools 

Which frameworks can you use to test Cairo contracts?

Well, luckily you have many options (all links are in the section below):

* `Protostar` - if you want to benefit from Rust's speed and write your tests directly in Cairo 
* `Nile` - if you like Python and want to perform quick tests via the CLI or build more complex tests using their plugin system
* `Pytest` and StarkNet testing class (refer to cairo-contracts test suites to see how to use it)
* `Starknet-devnet` to launch a local environment where you can perform local testing (works in tandem with nile and/or the starknet CLI)
* `StarkNet` plugin for HardHat - a plugin to use StarkNet with HardHat for developing and testing smart contracts
* `Ape Worx` - a Bronwie like framework that can be used to develop and test smart contracts on different chains. Written in Python
* `Starknet-py` - a Python library for developing and testing StarkNet smart contracts 

> Please let us know what we missed, and they will be added. 

## References

Here are all of the links that have been used in this research (plus some extra), and that have been mentioned. Thanks to everyone for their great content, and for making StarkNet awesome. 

* StarkWare - [Cairo whitepaper](https://eprint.iacr.org/2021/1063)
* StarkWare - [StarkNet Docs](https://docs.starknet.io/)
* StarkWare - [How Cairo Works](https://starknet.io/docs/how_cairo_works/index.html)
* StarkWare - [Hello StarkNet](https://starknet.io/docs/hello_starknet/index.html)
* OpenZeppelin - [Cairo contracts](https://github.com/OpenZeppelin/cairo-contracts)
* ChainSecurity - [MakerDAO StarkNet bridge audit](https://chainsecurity.com/wp-content/uploads/2021/12/ChainSecurity_MakerDAO_StarkNet-DAI-Bridge_audit.pdf)
* CairoPractice - [Cairo conventions](https://mirror.xyz/0xa37228277Ed21843c5F61F4Ed2928Af5Df2A81C9/GJHHUYJDfN-0Ok8yO7jsjAJaxBefWGcyVhNwpE_IJJw)
* CoinMonks - [Variable name clashing](https://medium.com/coinmonks/storage-variable-clashing-in-starknet-ce5f28e60886)
* Ape Worx - [StarkNet plugin](https://github.com/ApeWorX/ape-starknet)
* OnlyDust - [development guidelines](https://github.com/onlydustxyz/development-guidelines/blob/main/starknet/README.md)
* Empiric Network - [price feeds](https://empiric.network/)
* Stork Oracle - [price feeds](https://www.stork.network/)
* StarkNet-py - [repo](https://github.com/software-mansion/starknet.py)
* OpenZeppelin - [Nile](https://github.com/OpenZeppelin/nile)
* Shard Labs - [StarkNet Devnet](https://github.com/Shard-Labs/starknet-devnet)
* StarkWare - [Cairo standard library](https://github.com/starkware-libs/cairo-lang/tree/master/src/starkware)
* InfluenceEth - [Math64x61](https://github.com/influenceth/cairo-math-64x61/)
* Beautyisourbusiness - [Cairo Goldmine](https://github.com/beautyisourbusiness/cairo-goldmine)
* ShardLabs - HardHat StarkNet plugin [repo](https://github.com/Shard-Labs/starknet-hardhat-plugin)
* OnlyDust - [Starklings](https://github.com/onlydustxyz/starklings) (if you want to learn Cairo in a fun and interactive way)
* 0xNonCents - [VRF](https://twitter.com/0xNonCents/status/1555288515314946049)
* Hackernoon - [article](https://hackernoon.com/what-is-cairo-lang-10-best-resources-for-scaling-dapps-using-starks)
* Empiric Network - [writing upgradable contracts](https://medium.com/@EmpiricNetwork/starknet-guide-writing-upgradable-contracts-using-a-proxy-af3f107f238b)
* OpenZeppelin - [extensibility patter](https://docs.openzeppelin.com/contracts-cairo/0.3.1/extensibility)
* Amanusk Paradigm CTF [cairo solutions](https://github.com/amanusk/cairo-paradigm-ctf)
* Crytic (ToB) - [not so smart cairo contracts](https://github.com/crytic/building-secure-contracts/tree/master/not-so-smart-contracts/cairo)
* Fravoll - [Checks-effects-interaction pattern](https://fravoll.github.io/solidity-patterns/checks_effects_interactions.html)
* CoinDesk - [re-entrancy attacks](https://www.coindesk.com/tech/2022/03/31/ola-finance-exploited-for-36m-in-re-entrancy-attack/)
* CoinMarketCap - [DAO hack](https://coinmarketcap.com/alexandria/article/a-history-of-the-dao-hack)
* Jordan McKinney - [the Felt integer type explained](https://www.youtube.com/watch?v=jcrAq71WwSM)

## P.S. 

> This guide will be maintained and examples and new sections added as more research is conducted. We also encourage other devs and auditors to contribute to it and give feedback. 

[Repository link](https://github.com/ctrlc03/ctrlc03.github.io)
