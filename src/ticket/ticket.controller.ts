import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TicketCheckDto } from 'src/dtos/ticket-data.dto';
import { TicketCheckinDto } from 'src/dtos/ticket-checkin.dto';
import { TicketService } from './ticket.service';
import { ethers } from 'ethers';

@ApiTags('ticket')
@Controller('ticket')
export class TicketController {
  constructor(private readonly ticketService: TicketService) { }

  @Post('')
  @ApiOperation({
    summary: 'Check signature validity before minting a ticket token',
    description:
      'Requests the server to check the signature validity before minting a ticket token. If pass, server generates an unique ticket image',
  })
  @ApiResponse({
    status: 201,
    description: 'Signature check pass',
    type: Number,
  })
  @ApiResponse({
    status: 401,
    description: 'Missing signature',
    type: HttpException,
  })
  @ApiResponse({
    status: 403,
    description: 'Wrong signature',
    type: HttpException,
  })
  @ApiResponse({
    status: 500,
    description: 'Invalid signature',
    type: HttpException,
  })
  @ApiResponse({
    status: 501,
    description: 'Event has not been created',
    type: HttpException,
  })
  async checkBuyerSignature(@Body() ticketCheckDto: TicketCheckDto) {
    const signature = ticketCheckDto.buySignature;
    if (!signature || signature.length == 0)
      throw new HttpException('Missing signature', 401);
    let signatureValid = false;
    try {
      signatureValid = this.ticketService.verifyBuySignature(ticketCheckDto);
    } catch (error) {
      throw new HttpException("Invalid signature: " + error.message, 500);
    }
    if (!signatureValid) throw new HttpException('Signature does not match with the requested address', 403);
    return signatureValid;
  }

  @Get('/:walletAddress')
  @ApiOperation({
    summary: 'Request a ticket uri from IPFS to the provided walletAddress',
    description:
      '1. Checks the balance of this account to ensure it has none-zero ticket. 2. If pass, server uploads to IPFS. 3. Uploads {name, id, ticketType,  signedHash, imageURI} to IPFS and return the jsonURI to frontend.',
  })
  @ApiResponse({
    status: 200,
    description: 'Gets ticket metadata jsonURI',
    type: Number,
  })
  @ApiResponse({
    status: 402,
    description: 'Wallet address is invalid',
    type: HttpException,
  })
  @ApiResponse({
    status: 403,
    description: 'No ticket info found',
    type: HttpException,
  })
  @ApiResponse({
    status: 501,
    description: 'The attendee has not bought ticket yet',
    type: HttpException,
  })
  @ApiResponse({
    status: 503,
    description: 'The server is not configured correctly',
    type: HttpException,
  })
  async getTicket(@Param('walletAddress') walletAddress: string) {
    const addressValid = ethers.utils.isAddress(walletAddress);
    if (!addressValid)
      throw new HttpException('Provided wallet address is invalid', 402);
    const tokenBalance = await this.ticketService.tokenBalanceOf(walletAddress);
    let ticketJsonObj;
    if (tokenBalance > 0) {
      try {
        ticketJsonObj = await this.ticketService.getTicket(walletAddress);
      } catch (error) {
        throw new HttpException('No ticket info found. ' + error.message, 403)
      }
    } else {
      throw new HttpException('Has not bought ticket yet', 501)
    }
    return ticketJsonObj;
  }

  @Get('')
  @ApiOperation({
    summary: 'All tickets sold for the event',
    description: 'Gets all tickets stored of this event on this server',
  })
  @ApiResponse({
    status: 200,
    description: 'All tickets',
  })
  @ApiResponse({
    status: 503,
    description: 'The server is not configured correctly',
    type: HttpException,
  })
  async getTickets() {
    try {
      const result = this.ticketService.getTickets();
      return result;
    } catch (error) {
      throw new HttpException(error.message, 503);
    }
  }

  @Post('/check-in')
  @ApiOperation({
    summary: 'Checkin a ticket',
    description: 'Requests to checkin a ticket',
  })
  @ApiResponse({
    status: 201,
    description: 'Ticket checked in',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing signature',
    type: HttpException,
  })
  @ApiResponse({
    status: 403,
    description: 'Wrong signature',
    type: HttpException,
  })
  @ApiResponse({
    status: 500,
    description: 'Invalid signature',
    type: HttpException,
  })
  @ApiResponse({
    status: 503,
    description: 'The server is not configured correctly',
    type: HttpException,
  })
  async checkin(@Body() ticketCheckinDto: TicketCheckinDto) {
    const signature = ticketCheckinDto.signedHashForCheckin;
    if (!signature || signature.length == 0)
      throw new HttpException('Missing signature', 401);
    let signatureValid = false;
    try {
      signatureValid = await this.ticketService.verifyCheckinSignature(ticketCheckinDto);
    } catch (error) {
      throw new HttpException("Invalid signature: " + error.message, 500);
    }
    if (!signatureValid) throw new HttpException('Signature does not match with the requested address', 403);
    if (!signature || signature.length == 0)
      throw new HttpException('Missing signature', 401);
    const checkedIn = await this.ticketService.checkin(ticketCheckinDto);
    return checkedIn;
  }
}
