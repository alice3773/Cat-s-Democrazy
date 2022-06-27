const { ethers } = require('hardhat');

const admin1 = ethers.provider.getSigner(0);
const admin2 = ethers.provider.getSigner(1);

async function deployNft() {
    const Cat = await ethers.getContractFactory('Cat');
    const cat = await Cat.deploy();

    await cat.deployed();

    return cat;
}

async function mintNftToken(
    nftContract,
    nftTokenMetaDataUri,
    tokenOwnerAddress
) {
    const Cat = await ethers.getContractFactory('Cat');
    const cat = await Cat.attach(nftContract.address);

    const mintNftTxn = await cat.mintNft(
        tokenOwnerAddress,
        nftTokenMetaDataUri
    );

    const mintNftTxnReceipt = await mintNftTxn.wait();

    const transferEvent = mintNftTxnReceipt.events.find(
        (event) => event.event === 'Transfer'
    );

    // per the ERC721 Transfer event, the token id is the 3rd arg of the event
    // reference: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC721/IERC721.sol
    return transferEvent.args[2];
}

async function deployVoting() {
    const nftContract = await deployNft();
    const Voting = await ethers.getContractFactory('Voting');
    const address1 = await admin1.getAddress();
    const address2 = await admin2.getAddress();
    const voting = await Voting.deploy([address1, address2], nftContract.address);

    await voting.deployed();

    return voting;
}

exports.deployNft = deployNft;
exports.mintNftToken = mintNftToken;
exports.deployVoting = deployVoting;