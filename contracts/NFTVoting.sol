// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./Cat.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "hardhat/console.sol";


contract NFTVoting {
    enum VoteStates {Absent, Yes, No}
    uint totalNFTMinted = 3;

    enum ProposalState {
        Pending, // not started yet
        Active, // start voting 
        Cancelled, // proposal is cancelled before the voting starts
        Expired, // proposal is expired
        Failed, // proposal is not passed
        Succeeded, // proposal is passed
        Queued, // after passed, proposal is in the queue and wating to be executed
        Executed // proposal is executed
    }

    struct Proposal {
        address creator;
        string question;
        uint startDate;
        uint deadline;
        uint yesCount;
        uint noCount;
        address payable target;
        uint amount;
        ProposalState state;
        bool cancelled;
        bool executed;
        mapping (address => VoteStates) voteStates;
    }

    Proposal[] public proposals;

    event Received(address sender, uint vale);
    event ProposalCreated(uint id);
    event VoteCast(uint id, address indexed, bool _support, uint voteAmount);
    event RemoveVote(uint id, address indexed, uint voteAmount);
    event ProposalCancelled(uint id);
    event ProposalPassed(uint id, uint noOfVotes, ProposalState state);
    event ProposalQueued(uint id, uint timestamp);
    event ProposalExecuted(uint id);


    mapping(address => bool) public admins;
    uint countadmins;
    // count members increase if the users has voting right for the proposal 

    address public nftAddress;
    IERC721 public cat;
  
    constructor(address[] memory _admins, address _nftAddress) {
        for(uint i = 0; i < _admins.length; i++) {
            admins[_admins[i]] = true;
            admins[msg.sender] = true;
            countadmins++;
        }
        admins[msg.sender] = true;
        nftAddress = _nftAddress;
        cat = IERC721(nftAddress);
    }

    function addAdmins(address _admin) external {
        require(admins[msg.sender], "Error: Only the admin in the DAO can perform this changes");
        require(_admin != address(0), "Error: Can't add admin for the zero address");
        admins[_admin] = true;
        countadmins++;
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    function checkBalance(address _address) public view returns(uint256) {
        uint256 balance = cat.balanceOf(_address);
        return balance;
    }

    // check if the address have the NFT
    function canVote(address _address) public view returns(bool) {
        if (checkBalance(_address) > 0) {
            return true;
        }
        return false;
    }

    function getLength() public view returns (uint256) {
        return proposals.length;
    }

    function newProposal(string calldata _question, uint _startDate, uint _deadline, address payable _target, uint _amount) external {
        require(canVote(msg.sender) || admins[msg.sender], "Error :Only the admin or the member in the Dao can create a new proposal");
        // allow at least 3 days to kick start the voting
        require(_startDate > block.timestamp + 3 days);
        require(_deadline > _startDate + 3 days, "Error: Can't create a proposal that is in the past");
        require(_deadline < block.timestamp + 30 days);
        require(_amount < address(this).balance, "Error: Excess contract balance");
        Proposal storage proposal = proposals.push();
        proposal.creator = msg.sender;
        proposal.question = _question;
        proposal.startDate = _startDate;
        proposal.deadline = _deadline;
        proposal.target = _target;
        proposal.amount = _amount;
        proposal.state = ProposalState.Pending;
        proposal.voteStates[msg.sender] = VoteStates.Yes;
        // automatically vote yes to the proposal
        uint numOfVotes = checkBalance(msg.sender);
        proposal.yesCount += numOfVotes;
        emit ProposalCreated(proposals.length);
    }

    function delistProposal(uint _proposalId) external {
        Proposal storage proposal = proposals[_proposalId];
        require(msg.sender == proposal.creator, "Error: This option is only available to the proposal's creator");
        require(block.timestamp < proposal.startDate, "Error: Can't delist the proposal after starting the voting period");
        proposal.state = ProposalState.Cancelled;
        proposal.cancelled = true;
        emit ProposalCancelled(_proposalId);
    }

    function castVote(uint _proposalId, bool _supports) external {
        require(canVote(msg.sender) || admins[msg.sender], "Error: Only the admin or the member can propose a proposal");
        Proposal storage proposal = proposals[_proposalId];
        require(block.timestamp >= proposal.startDate, "Error: Voting period not started yet");
        // kick start the voting
        if (block.timestamp >= proposal.startDate) {
            proposal.state = ProposalState.Active;
        }
        require(block.timestamp <= proposal.deadline, "Error: Voting period is ended");
        // end the proposal
        if (block.timestamp > proposal.deadline) {
            proposal.state = ProposalState.Expired;
        }

        // check the number of votes the user has
        uint numOfVotes = checkBalance(msg.sender);

        // clear out previous vote
        if(proposal.voteStates[msg.sender] == VoteStates.Yes) {
            proposal.yesCount -= numOfVotes;
        }
        if(proposal.voteStates[msg.sender] == VoteStates.No) {
            proposal.noCount -= numOfVotes;
        }

        // add new vote
        if(_supports) {
            proposal.yesCount += numOfVotes;
            proposal.voteStates[msg.sender] = VoteStates.Yes;
        }
        else {
            proposal.noCount += numOfVotes;
            proposal.voteStates[msg.sender] = VoteStates.Yes;
        }

        proposal.voteStates[msg.sender] = _supports ? VoteStates.Yes : VoteStates.No;

        emit VoteCast(_proposalId, msg.sender, _supports, numOfVotes);
    }

    function removeVote(uint _proposalId) external {
        Proposal storage proposal = proposals[_proposalId];
        require(proposal.voteStates[msg.sender] == VoteStates.Yes || proposal.voteStates[msg.sender] == VoteStates.No, "You haven't voted for the proposal");
        uint numOfVotes = checkBalance(msg.sender);
        if(proposal.voteStates[msg.sender] == VoteStates.Yes) {
            proposal.yesCount -= numOfVotes;
            proposal.voteStates[msg.sender] = VoteStates.Absent;
        }
        if(proposal.voteStates[msg.sender] == VoteStates.No) {
            proposal.noCount -= numOfVotes;
            proposal.voteStates[msg.sender] = VoteStates.Absent;
        }
        emit RemoveVote(_proposalId, msg.sender, numOfVotes);
    }

    function isPassed(uint _proposalId) public returns (ProposalState) {
        Proposal storage proposal = proposals[_proposalId];
        uint avgVote = SafeMath.div(totalNFTMinted, 2);
        if (proposal.yesCount >= avgVote + 1) {
            proposal.state = ProposalState.Succeeded;
            emit ProposalPassed(_proposalId, proposal.yesCount, proposal.state);
            return ProposalState.Succeeded;
        } else {
            proposal.state = ProposalState.Failed;
            return ProposalState.Failed;
        }
    }

    function addToQueue(uint _proposalId) external {
        Proposal storage proposal = proposals[_proposalId];
        require(admins[msg.sender], "Only the admin can add the proposal to the queue");
        require(block.timestamp > proposal.deadline);
        require(proposal.state == ProposalState.Succeeded, "Only the passed proposal can be added to the queue");
        proposal.state == ProposalState.Queued;
        emit ProposalQueued(_proposalId, block.timestamp);
    }

    function execute(uint _proposalId) external {
        Proposal storage proposal = proposals[_proposalId];
        require(admins[msg.sender], "Proposal is only exectued by the admin");
        proposal.target.transfer(proposal.amount);
        proposal.executed = true;
        emit ProposalExecuted(_proposalId);
    }


}
