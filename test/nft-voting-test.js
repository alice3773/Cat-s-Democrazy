const { assert, expect } = require('chai');
const { ethers } = require("hardhat");
const {
    deployNft,
    mintNftToken,
} = require('./Cat-helpers');

const NFT_TOKEN_METADATA_URI = process.env.NFT_TOKEN_METADATA_URI;

describe('NFTVoting', async() => {
    let voting;
    let nftContract;
    let futureDeadline = Date.parse("15 Jul 2022 00:00:00 GMT") / 1000;
    let startDate = Date.parse("3 Jul 2022 00:00:00 GMT") / 1000;

    before(async() => {
        deployer = await ethers.provider.getSigner(0);
        member1 = await ethers.provider.getSigner(1);
        member2 = await ethers.provider.getSigner(2);
        admin1 = await ethers.provider.getSigner(3);
        admin2 = await ethers.provider.getSigner(4);
        nonmember = await ethers.provider.getSigner(5);
        addToAdmins = await ethers.provider.getSigner(6);
        targetaddress = await ethers.provider.getSigner(7);

        nftContract = await deployNft();
        const Voting = await ethers.getContractFactory("NFTVoting");
        voting = await Voting.deploy([await admin1.getAddress(), await admin2.getAddress()], nftContract.address);
        await voting.deployed();

        const nftMinted1 = await mintNftToken(
            nftContract,
            NFT_TOKEN_METADATA_URI,
            await member1.getAddress()
        );

        const nftMinted2 = await mintNftToken(
            nftContract,
            NFT_TOKEN_METADATA_URI,
            await member1.getAddress()
        );

        const nftMinted3 = await mintNftToken(
            nftContract,
            NFT_TOKEN_METADATA_URI,
            await member2.getAddress()
        );

        // console.log(nftMinted1);

    });

    describe("Add admins", () => {
        it('should add a new admin into the DAO', async() => {
            await voting.connect(admin1).addAdmins(await addToAdmins.getAddress());
            expect(await voting.admins(addToAdmins.getAddress())).to.be.true;
        });

        it('should revert if a non-admin try to add new admin', async() => {
            await expect(voting.connect(member1).addAdmins(await addToAdmins.getAddress())).to.be.reverted;
        });
    });

    describe('Receive ethers', () => {
        it('should receive ethers', async() => {
            const tx = await nonmember.sendTransaction({
                to: voting.address,
                value: ethers.utils.parseEther("6")
            });
            // console.log(tx);
            let votingBalance = await ethers.provider.getBalance(voting.address);
            // console.log(votingBalance);
            expect(votingBalance).to.equal("6000000000000000000");
        });
    });

    describe('NFT balance', () => {
        it('should check the NFT balance', async() => {
            let balance = await voting.checkBalance(member1.getAddress());
            // console.log(balance);
            expect(balance).to.equal(2);
        });

        it('should check if the user can vote for the porposal', async() => {
            let result = await voting.canVote(member1.getAddress());
            // console.log(result);
            expect(result).to.be.true;
        });
    });

    describe('New proposal', () => {
        it('should create a proposal successfully from a member', async() => {
            let receipt;
            const tx = await nonmember.sendTransaction({
                to: voting.address,
                value: ethers.utils.parseEther("1000")
            });
            // console.log(tx);
            const result = await voting.connect(member1).newProposal(
                "Should we invest 10 ETH in the Private round B for the xxxx project?",
                startDate,
                futureDeadline,
                targetaddress.getAddress(),
                10
            );
            // console.log(result);
            receipt = await result.wait();
            const event = receipt.events.find(x => x.event === 'ProposalCreated');
            // console.log(event);
            assert(event, "Event not found");
        });

        it('should revert if a non-member try to create a new porposal', async() => {
            await expect(voting.connect(nonmember).newProposal(
                "Should we invest 10 ETH in the Private round B for the xxxx project?",
                startDate,
                futureDeadline,
                targetaddress.getAddress(),
                10
            )).to.be.reverted;
        });

        it('should get the proposal length', async() => {
            expect(await voting.getLength()).to.equal(1);
        })
    });

    describe('Delist the proposal & emit the `ProposalCancelled` event', () => {
        it('should delist the proposal from a creator', async() => {
            let receipt2;
            let receipt3;
            const tx = await nonmember.sendTransaction({
                to: voting.address,
                value: ethers.utils.parseEther("1000")
            });
            // console.log(tx);
            const proposal2 = await voting.connect(member1).newProposal(
                "Should we invest 10 ETH in the Private round B for the xxxx project?",
                startDate,
                futureDeadline,
                targetaddress.getAddress(),
                10
            );

            receipt2 = await proposal2.wait();

            const proposal3 = await voting.connect(member1).newProposal(
                "Should we invest 10 ETH in the Private round B for the xxxx project?",
                startDate,
                futureDeadline,
                targetaddress.getAddress(),
                10
            );
            receipt3 = await proposal3.wait();

            const delisted = await voting.connect(member1).delistProposal(2);
            receipt2 = await delisted.wait();
            const event = receipt2.events.find(x => x.event === "ProposalCancelled");
            assert(event, "Event not found!");
            // console.log(event);
            const id = parseFloat(event.args['id']);
            expect(id).to.equal(2);
            // console.log(id);
        });

        it('should revert if a non-creater try to delist the proposal', async() => {
            await expect(voting.connect(member2).delistProposal(1)).to.be.reverted;
        });
    });

    describe('Cast vote', () => {
        it('should cast the vote within a valid voting period', async() => {

            // fastforward the timestamp to 6 Jul, 2022
            await network.provider.send("evm_setNextBlockTimestamp", [1657065600]);

            const voted = await voting.connect(member2).castVote(
                1,
                true
            );
            receipt2 = await voted.wait();
            const event = receipt2.events.find(x => x.event === "VoteCast");
            // console.log(event);
            assert(event, "Event not found!");
        });

        it('should remove the vote', async() => {
            let receipt;

            const removed = await voting.connect(member2).removeVote(1);
            receipt = await removed.wait();

            const event = receipt.events.find(x => x.event === "RemoveVote");
            // console.log(event);
            assert(event, "Event not found!");
        });

        it('should revert if the member has not voted for the proposal', async() => {
            await expect(voting.connect(admin2).removeVote(1)).to.be.reverted;
        })

    });
    describe('After the voting period', () => {
        it('should pass the proposal if have enough votes', async() => {
            let receipt;
            const passed = await voting.connect(admin1).isPassed(1);
            receipt = await passed.wait();
            const event = receipt.events.find(x => x.event === "ProposalPassed");
            // console.log(event);
            assert(event, "Event not found!");
        });

        it('should add the passed porposal into the queue', async() => {
            let receipt;
            // fast forward to 15 Jul 2022
            await network.provider.send("evm_setNextBlockTimestamp", [1657922400]);
            const added = await voting.connect(admin1).addToQueue(1);
            receipt = await added.wait();
            const event = receipt.events.find(x => x.event === "ProposalQueued");
            assert(event, "Event not found!");
        });

        it('should revert if the non-admin try to add the proposal into the queue', async() => {
            await expect(voting.connect(member2).addToQueue(1)).to.be.reverted;
        })

        it('should execute the proposal', async() => {
            let receipt;
            const executed = await voting.connect(admin1).execute(1);
            receipt = await executed.wait();
            const event = receipt.events.find(x => x.event === "ProposalExecuted");
            assert(event, "Event not found!");
        });

        it('should revert if the non-admin try to exectue the proposal', async() => {
            await expect(voting.connect(member1).execute(1)).to.be.reverted;
        });

    });

});