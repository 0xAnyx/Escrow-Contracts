//SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";

contract Escrow is Ownable{

    uint FEE = 20;

    struct tokenInfo{
        address owner;
        address reserve;
        uint fee;
        uint price;
        uint position;
    }

    struct userListing{
        address listContract;
        uint tokenId;
    }

    mapping(address=>mapping(uint=>tokenInfo)) public listingInfo;
    mapping(address=>userListing[]) public userListings;
    mapping(address=>uint) public balance;

    event tokenListed(address indexed _contract,address indexed _user,uint indexed _token,address _reserved,uint _price);
    event tokenBought(address indexed _contract,address indexed _buyer,uint indexed _token);
    event tokenDelisted(address indexed _contract,address indexed _user,uint indexed _token);

    function listToken(address _contract,uint _token,uint _price,address _reserve) external {
        IERC721 currContract = IERC721(_contract);
        require(currContract.ownerOf(_token) == msg.sender,"Not owner");
        require(_reserve != msg.sender, "Can't Reserve yourself");
        listingInfo[_contract][_token] = tokenInfo(msg.sender,_reserve,FEE,_price,userListings[msg.sender].length);
        userListings[msg.sender].push(userListing(_contract,_token));
        currContract.transferFrom(msg.sender,address(this),_token);
        emit tokenListed(_contract, msg.sender, _token,_reserve, _price);
    }

    function delistToken(address _contract,uint _token) external {
        tokenInfo storage currInfo = listingInfo[_contract][_token];
        require(currInfo.owner == msg.sender,"Not owner");
        IERC721(_contract).transferFrom(address(this), msg.sender, _token);
        popListing(_contract, _token);
        delete listingInfo[_contract][_token];
        emit tokenDelisted(_contract, msg.sender, _token);
    }

    function buyToken(address _contract, uint _token) external payable{
        tokenInfo storage currInfo = listingInfo[_contract][_token];
        require(currInfo.owner != msg.sender,"Can't buy self listed");
        require(currInfo.owner != address(0),"Token not listed");
        require(currInfo.reserve == address(0) || currInfo.reserve == msg.sender,"Not reserved user");
        require(msg.value >= currInfo.price,"Price not paid");
        IERC721(_contract).transferFrom(address(this),msg.sender,_token);
        uint fee = msg.value * FEE/1000;
        balance[currInfo.owner] += msg.value - fee;
        balance[address(this)] += fee;
        popListing(_contract, _token);
        delete listingInfo[_contract][_token];
        emit tokenBought(_contract, msg.sender, _token);
    }

    function popListing(address _contract,uint _token) private {
        uint currPosition = listingInfo[_contract][_token].position;
        address currOwner = listingInfo[_contract][_token].owner;
        userListing memory lastListing = userListings[currOwner][userListings[currOwner].length - 1];
        userListings[currOwner][currPosition] = lastListing;
        listingInfo[lastListing.listContract][lastListing.tokenId].position = currPosition;
        userListings[currOwner].pop();
    }

    function getUserListing(address _user) external view returns(userListing[] memory){
        return userListings[_user];
    }

    function withdrawBalance() external{
        uint amount = balance[msg.sender];
        balance[msg.sender] = 0;
        payable(msg.sender).transfer(amount);
    }

    function withdrawFees() external onlyOwner{
        uint amount = balance[address(this)];
        balance[address(this)] = 0;
        payable(msg.sender).transfer(amount);
    }

    function updateFee(uint _fee) external onlyOwner{
        FEE = _fee;
    }

}