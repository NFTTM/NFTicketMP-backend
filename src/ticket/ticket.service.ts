import { Injectable } from '@nestjs/common';
import { JsonDB } from 'node-json-db';
import { Config } from 'node-json-db/dist/lib/JsonDBConfig';
import { ethers } from 'ethers';
import { TicketData } from 'src/schemas/ticket-data.interface'
import { TicketCheckDto } from 'src/dtos/ticket-data.dto';
import { ProviderService } from 'src/shared/services/provider/provider.service';
import { SignerService } from 'src/shared/services/signer/signer.service';
import * as watermark from 'jimp-watermark';
import * as TokenContract from 'src/assets/contracts/TokenContract.json';
import { TicketCheckinDto } from 'src/dtos/ticket-checkin.dto';
import { IpfsService } from 'src/shared/services/ipfs/ipfs.service';
import { promises as fs } from 'fs';

const DB_PATH = './db/db.json';

@Injectable()
export class TicketService {
  db: JsonDB;
  contractPublicInstance: ethers.Contract;
  contractSignedInstance: ethers.Contract;

  constructor(
    private providerService: ProviderService,
    private signerService: SignerService,
    private ipfsService: IpfsService
  ) {
    this.db = new JsonDB(new Config(DB_PATH, true, true, '/'));
    this.setupContractInstances();
  }

  async setupContractInstances() {
    const contractAddress = process.env.TOKEN_CONTRACT_ADDRESS;
    if (!contractAddress || contractAddress.length === 0) return;

    const balanceBN = await this.signerService.signer.getBalance();
    const balance = Number(ethers.utils.formatEther(balanceBN));

    this.contractPublicInstance = new ethers.Contract(
      contractAddress,
      TokenContract.abi,
      this.providerService.provider,
    );
    this.contractSignedInstance = new ethers.Contract(
      contractAddress,
      TokenContract.abi,
      this.signerService.signer,
    );
  }

  getAll() {
    return this.db.getData('/');
  }

  getTickets() {
    return this.db.getData(`/tickets/`);
  }

  verifyBuySignature(ticketCheckDto: TicketCheckDto) {
    const signatureObject = { name: ticketCheckDto.name, id: ticketCheckDto.id, ticketType: ticketCheckDto.ticketType };
    const signatureMessage = JSON.stringify(signatureObject);
    const signerAddress = ethers.utils.verifyMessage(signatureMessage, ticketCheckDto.buySignature);
    const signatureValid = signerAddress == ticketCheckDto.address;
    if (signatureValid) {
      const obj = new TicketData(ticketCheckDto);
      this.db.push(`/tickets/${ticketCheckDto.address}/`, obj);
    }
    return signatureValid;
  }

  async tokenBalanceOf(address: string) {
    const balanceBN = await this.contractSignedInstance.balanceOf(address);
    const balance: number = +ethers.utils.formatEther(balanceBN);
    return balance;
  }

  async generateTicketImage(name: string, id: string, ticketType: string, ticketId: number) {
    let storageName;
    try {
      storageName = this.db.getData('/event/file/storageName/')
    } catch (error) {
      throw error;
    }
    var options = {
      'text': `${name} ${id} ${ticketType}`,
      'textSize': 6, //Should be between 1-8
      'dstPath': `./upload/${ticketId}/ticket.png`
    };
    const watermarkedImg = await watermark.addTextWatermark(`./upload/${storageName}`, options);
    return watermarkedImg.destinationPath;
  }

  async getTicket(walletAddress: string) {
    let ticket: TicketData;
    try {
      ticket = this.db.getData(`/tickets/${walletAddress}/`);
    } catch (error) {
      throw error;
    }
    let ticketIpfsObj;
    let ticketInfo: TicketCheckDto;
    let ticketIpfsURI: string;
    ticketInfo = ticket.ticketdata;
    if (ticket.ticketIpfs) {
      ticketIpfsObj = {
        name: ticketInfo.name,
        id: ticketInfo.id,
        ticketType: ticketInfo.ticketType,
        signedHash: ticketInfo.buySignature,
      };

      ticketIpfsURI = ticket.ticketIpfs.IpfsHash;
      return { ticketIpfsURI, ticketIpfsObj };
    }
    const ticketId = await this.contractSignedInstance.buyerToTicket(walletAddress);
    ticketIpfsObj = {
      name: ticketInfo.name,
      id: ticketInfo.id,
      ticketType: ticketInfo.ticketType,
      signedHash: ticketInfo.buySignature,
    };
    const src = `./upload/${ticketId}`;
    await fs.mkdir(src);

    const ticketImagePath = await this.generateTicketImage(
      ticketInfo.name,
      ticketInfo.id,
      ticketInfo.ticketType,
      ticketId
    );
    console.log(ticketImagePath);
    await fs.writeFile(`./upload/${ticketId}/ticket.json`, JSON.stringify(ticketIpfsObj, null, 4));
    const ticketJsonIpfsData = await this.ipfsService.saveFolderToIpfs(src);
    ticketIpfsURI = ticketJsonIpfsData.IpfsHash;
    this.db.push(`/tickets/${walletAddress}/ticketIpfs`, ticketJsonIpfsData);
    return { ticketIpfsURI, ticketIpfsObj };
  }

  async verifyCheckinSignature(ticketCheckinDto: TicketCheckinDto) {
    const signatureObject = {
      address: ticketCheckinDto.address,
      requestCheckin: ticketCheckinDto.requestCheckin,
    };
    const signatureMessage = JSON.stringify(signatureObject);
    const signerAddress = ethers.utils.verifyMessage(signatureMessage, ticketCheckinDto.signedHashForCheckin);
    const signatureValid = signerAddress == ticketCheckinDto.address;
    if (signatureValid) {
      this.db.push(
        `/tickets/${ticketCheckinDto.address}/ticketdata/checkinSignature/`,
        ticketCheckinDto.signedHashForCheckin
      );
    }
    return signatureValid;
  }

  async checkin(ticketCheckinDto: TicketCheckinDto) {
    // This function didn't know which ticket to checkin if an address holds multiple tickets.
    // Now backend didn't check if this addres holds a ticket or ticket expired.
    const attendeeAddress = ticketCheckinDto.address;
    const attendeeCheckedIn = await this.contractSignedInstance.checkedIn(attendeeAddress);
    if (attendeeCheckedIn) {
      return false;
    }
    await this.contractSignedInstance.checkAttendeeIn(attendeeAddress);
    return true;
  }
}
