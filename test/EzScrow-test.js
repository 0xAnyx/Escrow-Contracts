const { expect } = require("chai");
const { ethers } = require("hardhat");
const { constants } = require('@openzeppelin/test-helpers');
const { parseEther } = require("ethers/lib/utils");

describe("⦿ EzScrow Test Suite ", async () =>{
    let owner, alice, bob, carol, nft1, nft2, escrow;
    before(async () =>{
        [owner, alice, bob, carol] = await ethers.getSigners();
        const listedToken1 = await ethers.getContractFactory('testNFT1');
        nft1 = await listedToken1.deploy();
        const listedToken2 = await ethers.getContractFactory('testNFT2');
        nft2 = await listedToken2.deploy();
        const EzScrow = await ethers.getContractFactory('EscrowFactory');
        escrow = await EzScrow.deploy();

        await nft1.connect(alice).mint(2);
        await nft1.connect(bob).mint(2);
        await nft1.connect(carol).mint(2);
        await nft2.connect(alice).mint(2);
        await nft2.connect(bob).mint(2);

        await nft1.connect(alice).setApprovalForAll(escrow.address, true);
        await nft1.connect(bob).setApprovalForAll(escrow.address, true);
        await nft1.connect(carol).setApprovalForAll(escrow.address, true);

        await nft2.connect(alice).setApprovalForAll(escrow.address, true);
        await nft2.connect(bob).setApprovalForAll(escrow.address, true);
        await nft2.connect(carol).setApprovalForAll(escrow.address, true);
    });

    describe("Alice lists a token on the Escrow Contract ▼", async () =>{
        it('An Event would be generated with the listing details, No one is reserved', async () =>{
            await expect(escrow.connect(alice).listToken(nft1.address, 1,
                parseEther('100'), constants.ZERO_ADDRESS)).to.emit(escrow, 'tokenListed')
                .withArgs(nft1.address, alice.address, 1, constants.ZERO_ADDRESS, parseEther('100'));
        });

        it('Ownership of the item is transferred', async () =>{
            expect(await nft1.ownerOf(1)).to.eq(escrow.address);
        });

        it('listingInfo mapping gets updated', async () =>{
            const structVar = await escrow.listingInfo(nft1.address, 1);
            expect(structVar[0]).to.eq(alice.address);
            expect(structVar[1]).to.eq(constants.ZERO_ADDRESS);
            expect(structVar[2]).to.eq('20');
            expect(structVar[3]).to.eq(parseEther('100'));
            expect(structVar[4]).to.eq(0);
        });
    });

    describe("Bob lists a token from another project and reserves Carol to buy it ▼", async () =>{
        it("Reserved Address must show Carol's address", async () =>{
            await escrow.connect(bob).listToken(nft2.address, 4, parseEther('250'), carol.address);
            const structVar = await escrow.listingInfo(nft2.address, 4);
            expect(structVar[1]).to.eq(carol.address);
        });

        it("UserListing must get Updated", async () =>{
            const structVar = await escrow.userListings(bob.address, 0);
            expect(structVar[1]).to.eq(4)
        });
    });

    describe("Bob buys Alice's listed NFT from project 1 ▼", async () =>{
        it("Doesn't allow to buy Self-Listed token", async () =>{
            await expect(escrow.connect(alice).buyToken(nft1.address, 1))
                .to.be.revertedWith("Can't buy self listed");
        });

        it("Doesn't allow if price not paid", async () =>{
            await expect(escrow.connect(bob).buyToken(nft1.address, 1))
                .to.be.revertedWith("Price not paid");
        });

        it("Bob buys the NFT and ownership is transferred to him and an event generated", async () =>{
            await expect(escrow.connect(bob).buyToken(nft1.address, 1, {value: parseEther('120')})).to.emit(
                escrow, 'tokenBought').withArgs(nft1.address, bob.address, 1);
            expect(await nft1.ownerOf(1)).to.eq(bob.address);
        });

        it("Listing Info Data gets deleted", async () =>{
            const structVar = await escrow.listingInfo(nft1.address, 1);
            expect(structVar[1]).to.eq(constants.ZERO_ADDRESS);
        });

        it("Balance of seller gets updated", async () =>{
            expect(await escrow.balance(alice.address)).to.eq(parseEther('117.6'))
        });
    });

    describe("Carol buys hers reserved NFT ▼", async () =>{
        it("Alice tries to buy but will be rejected", async () =>{
            await expect(escrow.connect(alice).buyToken(nft2.address, 4))
                .to.be.revertedWith("Not reserved user");
        });

        it("Carol successfully owns the NFT", async () =>{
            await expect(escrow.connect(carol).buyToken(nft2.address, 4, {value: parseEther('250')})).to.emit(
                escrow, 'tokenBought').withArgs(nft2.address, carol.address, 4);
            expect(await nft2.ownerOf(4)).to.eq(carol.address);
        });
    });

    describe("Carol Lists a NFT and Updates Rewards ▼", async () =>{
        it('Cannot Reserve Yourself', async () =>{
            await expect(escrow.connect(carol).listToken(nft1.address, 6, parseEther('150'), carol.address))
                .to.be.revertedWith("Can't Reserve yourself");
        });

        it('List and Update Reward without DeListing', async () =>{
            await escrow.connect(carol).listToken(nft1.address, 6, parseEther('150'), alice.address);
            await escrow.updateFee(30);
        });

        it('Alice buys successfully and the fees cut would be 3%', async () =>{
            await expect(escrow.connect(alice).buyToken(nft1.address, 6, {value: parseEther('150')})).to.emit(
                escrow, 'tokenBought').withArgs(nft1.address, alice.address, 6);
            expect(await escrow.balance(escrow.address)).to.eq(parseEther('11.9'));
        });
    });

    describe("Withdrawing Phase ▼", async () =>{
        it('Alice Withdraws', async () =>{
            expect(await escrow.balance(alice.address)).to.eq(parseEther('117.6'));
            await escrow.connect(alice).withdrawBalance();
            expect(await escrow.balance(alice.address)).to.eq(parseEther('0'));
        });

        it('Bob Withdraws', async () =>{
            expect(await escrow.balance(bob.address)).to.eq(parseEther('245'));
            await escrow.connect(bob).withdrawBalance();
            expect(await escrow.balance(bob.address)).to.eq(parseEther('0'));
        });

        it('Carol Withdraws', async () =>{
            expect(await escrow.balance(carol.address)).to.eq(parseEther('145.5'));
            await escrow.connect(carol).withdrawBalance();
            expect(await escrow.balance(carol.address)).to.eq(parseEther('0'));
        });

        it('Owner Withdraws', async () =>{
            expect(await escrow.balance(escrow.address)).to.eq(parseEther('11.9'));
            await escrow.withdrawFees();
            expect(await escrow.balance(escrow.address)).to.eq(parseEther('0'));
        });
    });
});