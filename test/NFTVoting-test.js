const { assert, expect } = require('chai');
const { ethers } = require("hardhat");
const {
    deployNft,
    mintNftToken,
    deployVoting,
} = require('./Cat-helpers');
require('@nomiclabs/hardhat-waffle');

const NFT_TOKEN_METADATA_URI = process.env.NFT_TOKEN_METADATA_URI;

let contract;
let pastDeadline = Date.parse("05 Jan 2022 00:00:00 GMT") / 1000;
let futureDeadline = Date.parse("2 Jul 2022 00:00:00 GMT") / 1000;
let startDate = Date.parse("29 Jun 2022 00:00:00 GMT") / 1000;

describe('Voting', () => {

    before(async() => {
        let deployer = await ethers.provider.getSigner(0);
        let member1 = await ethers.provider.getSigner(1); // hv NFT
        let member2 = await ethers.provider.getSigner(2); // hv NFT
        let admin1 = await ethers.provider.getSigner(3);
        let admin2 = await ethers.provider.getSigner(4);
        let nonmember = await ethers.provider.getSigner(5);
        let addToAdmins = await ethers.provider.getSigner(6); // add to admins group
        let targetaddress = await ethers.provider.getSigner(7); // address to send funds to

        describe('constructor', () => {
            let nftContract;

            before(async() => {
                nftContract = await deployNft();
            });

            it('should deploy correctly', async() => {
                const Voting = await ethers.getContractFactory('Voting');
                const voting = await Voting.deploy([await admin1.getAddress(), await admin2.getAddress()], nftContract.address);

                await voting.deployed();

                expect(await voting.nftAddress()).to.equal(nftContract.address);
            });
        });

        xdescribe('Add admins', () => {
            it('should add admins into the DAO', async() => {
                let votingContract = await deployVoting();
                let address = await addToAdmins.getAddress();
                await votingContract.connect(deployer).addAdmins(address);
                expect.equal(votingContract.admins[address]).to.equal(true);
            });
        });

        xdescribe('Receive ethers', () => {
            it('should receive ethers', async() => {
                let votingContract = await deployVoting();
                const transaction = await nonmember.sendTransaction({
                    // to the deployed contract 
                    to: votingContract.address,
                    value: ethers.utils.parseEther('1.0')
                });
                expect.equal(contract(this.balance)).to.equal(1);
            });
        });

        xdescribe('Mint & send NFT to the user', () => {
            let votingContract;
            let nftContract;
            let nftTokenId;

            // need to change
            before(async() => {
                votingContract = await deployVoting();

                const nftContractAddress = await votingContract.nftAddress();

                const NFT = await ethers.getContractFactory('Cat');

                nftContract = await NFT.attach(nftContractAddress);
            });

            beforeEach(async() => {
                await mintNftToken(
                    nftContract,
                    NFT_TOKEN_METADATA_URI,
                    await member1.getAddress()
                );

                await mintNftToken(
                    nftContract,
                    NFT_TOKEN_METADATA_URI,
                    await member1.getAddress()
                );

                await mintNftToken(
                    nftContract,
                    NFT_TOKEN_METADATA_URI,
                    await member2.getAddress()
                );

                // connect to the voting contract as the NFT owner
                votingContract = await votingContract.connect(tokenOwner);

                // approve the voting contract to transfer the NFT
                const contract = await nftContract.connect(tokenOwner);
                contract.approve(dutchAuctionContract.address, nftTokenId);
            });

            describe('Check balance', () => {
                it('should check the correct balance for member1', async() => {
                    let balance = votingContract.checkBalance(await member1.getAddress());
                    expect(balance).to.equal(2);
                });

                it('should check the correct balance for member2', async() => {
                    let balance = votingContract.checkBalance(await member2.getAddress());
                    expect(balance).to.equal(1);
                });
            });

            describe('Verify if a memeber can vote', () => {
                it('should return true for a NFT holding member', async() => {
                    expect(votingContract.canVote(member1)).to.be.true;
                });

                it('should revert if the non-member try to vote', async() => {
                    expect(votingContract.canVote(nonmember)).to.be.false;
                });
            });

            describe('Creating a new proposal from a nonmember', () => {
                it.only('should revert if a nonmember try to create the porposal', async() => {
                    await expect(votingContract.connect(nonmember).newProposal(
                        "Should we donate to charity?",
                        startDate,
                        futureDeadline,
                        nonmember,
                        0.01)).to.be.reverted;
                });

                it('should create a proposal from a member, with a proper deadline & start date, and fill out other all necessary args', () => {
                    it('should emit `ProposalCreated` event', async() => {
                        let receipt;
                        const tx = await votingContract.connect(member1).newProposal(
                            "Should we donate to charity?",
                            startDate,
                            futureDeadline,
                            targetaddress,
                            10
                        );
                        receipt = await tx.wait();
                        const event = receipt.events.find(x => x.event === "ProposalCreated");
                        assert(event, "Event not found");
                    });
                })

            });

            describe('Delist the proposal & emit the `ProposalCancelled` event', () => {
                it('should delist the proposal', async() => {
                    let receipt1;
                    let receipt2;
                    const tx = await votingContract.connect(member1).newProposal(
                        "Should we invest the new project in the seed round?",
                        startDate,
                        futureDeadline,
                        targetaddress,
                        20
                    );
                    receipt1 = await tx.wait();
                    const tx2 = await votingContract.connect(member1).delistProposal(votingContract.Proposal.length);
                    receipt2 = await tx2.wait();
                    const event = receipt2.events.find(x => x.event === "ProposalCancelled");
                    assert(event, "Event not found!");
                });
            });

            describe('Cast Vote', () => {
                it('should cast the vote & emit the `VoteCast` event', async() => {
                    let receipt;
                    const tx = await votingContract.connect(member1).newProposal(
                        "Should we donate to charity?",
                        startDate,
                        futureDeadline,
                        targetaddress,
                        10
                    );
                    receipt = await tx.wait();
                    const voted = await votingContract.castVote(votingContract.Proposal.length, true);
                    const event = voted.events.find(x => x.event === "VoteCast");
                    assert(event, "Event not found");
                });
            });

            describe('After the voting period', () => {
                beforeEach(async() => {
                    let receipt;
                    const tx = await votingContract.connect(member1).newProposal(
                        "Should we donate to charity?",
                        startDate,
                        futureDeadline,
                        targetaddress,
                        10
                    );
                    receipt = await tx.wait();
                    const voted = await votingContract.castVote(votingContract.Proposal.length, true);
                });

                it('should check if the porposal is passed & emit the `ProposalPassed` event', async() => {
                    const result = await votingContract.isPassed(Proposal.length);
                    const event = result.events.find(x => x.event === "VoteCast");
                    assert(event, "Event not found");
                });

                it('should add the proposal to the queue & emit the `ProposalQueued` event', async() => {
                    await votingContract.isPassed(Proposal.length);
                    const queued = await votingContract.addToQueue(Proposal.length);
                    const event = queued.events.find(x => x.event === "ProposalQueued");
                    assert(event, "Event not found");
                });

                it('should execute the proposal & emit the `ProposalExecuted` event', async() => {
                    await votingContract.isPassed(Proposal.length);
                    await votingContract.addToQueue(Proposal.length);
                    const executed = votingContract.execute(Proposal.length);
                    const event = executed.events.find(x => x.event === "ProposalQueued");
                    assert(event, "Event not found");
                });

            });

        });

    });

});